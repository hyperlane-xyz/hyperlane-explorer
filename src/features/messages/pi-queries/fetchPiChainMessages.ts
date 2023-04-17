import { BigNumber, constants, ethers, providers } from 'ethers';

import { Mailbox__factory } from '@hyperlane-xyz/core';
import { MultiProvider } from '@hyperlane-xyz/sdk';
import { utils } from '@hyperlane-xyz/utils';

import { ExtendedLog, Message, MessageStatus } from '../../../types';
import { isValidAddress, isValidTransactionHash, normalizeAddress } from '../../../utils/addresses';
import {
  queryExplorerForBlock,
  queryExplorerForLogs,
  queryExplorerForTxReceipt,
  toProviderLog,
} from '../../../utils/explorers';
import { logger } from '../../../utils/logger';
import { ChainConfig } from '../../chains/chainConfig';

const PROVIDER_LOGS_BLOCK_WINDOW = 100_000;
const PROVIDER_BLOCK_DETAILS_WINDOW = 5_000;

const mailbox = Mailbox__factory.createInterface();
const dispatchTopic0 = mailbox.getEventTopic('Dispatch');
const dispatchIdTopic0 = mailbox.getEventTopic('DispatchId');
// const processTopic0 = mailbox.getEventTopic('Process');
// const processIdTopic0 = mailbox.getEventTopic('ProcessId');

export interface PiMessageQuery {
  input: string;
  fromBlock?: string | number;
  toBlock?: string | number;
}

export enum PiQueryType {
  Address = 'address',
  TxHash = 'txHash',
  MsgId = 'msgId',
}

/* Pseudo-code for the fetch algo below: 
========================================
searchForMessages(input):
  for chain of piChains:
    dataSource = chain.explorer || chain.rpc
    mailbox = chain.contracts.mailbox
    if input is address:
      logs = dataSource.getLogs() where:
        contract is mailbox
        topic0 is Dispatch or Process
        sender/recipient topic is input
      return logs.map( l => l.message )
    if input is hash:
      tx = dataSource.getTransactionReceipt(input)
      if tx is found:
        logs = tx.logs where topic0 is Dispatch or Process
        if logs are found return logs.map( l => l.message )
      else tx is not found:   
        // input may be a message ID
        logs = dataSource.getLogs() where:
          contract is mailbox
          topic0 is DispatchId or ProcessId
          topic1 is input
        hash = logs[0].txHash
        GOTO hash search above
*/

export async function fetchMessagesFromPiChain(
  chainConfig: ChainConfig,
  query: PiMessageQuery,
  multiProvider: MultiProvider,
  queryType?: PiQueryType, // optionally force search down to just one type
): Promise<Message[]> {
  const useExplorer = !!chainConfig.blockExplorers?.[0]?.apiUrl;
  const input = query.input;

  let logs: ExtendedLog[] = [];
  if (isValidAddress(input) && (!queryType || queryType === PiQueryType.Address)) {
    logs = await fetchLogsForAddress(chainConfig, query, multiProvider, useExplorer);
  } else if (isValidTransactionHash(input)) {
    if (!queryType || queryType === PiQueryType.TxHash) {
      logs = await fetchLogsForTxHash(chainConfig, query, multiProvider, useExplorer);
    }
    // Input may be a msg id, check that next
    if ((!queryType || queryType === PiQueryType.MsgId) && !logs.length) {
      logs = await fetchLogsForMsgId(chainConfig, query, multiProvider, useExplorer);
    }
  } else {
    logger.warn('Invalid PI search input', input, queryType);
    return [];
  }

  const messages = logs
    .map((l) => logToMessage(multiProvider, l, chainConfig))
    .filter((m): m is Message => !!m);

  const messagesWithGasPayments: Message[] = [];
  // Avoiding parallelism here out of caution for RPC rate limits
  for (const m of messages) {
    messagesWithGasPayments.push(
      await tryFetchIgpGasPayments(m, chainConfig, multiProvider, useExplorer),
    );
  }
  return messagesWithGasPayments;
}

async function fetchLogsForAddress(
  { chainId, contracts }: ChainConfig,
  query: PiMessageQuery,
  multiProvider: MultiProvider,
  useExplorer?: boolean,
): Promise<ExtendedLog[]> {
  const address = query.input;
  logger.debug(`Fetching logs for address ${address} on chain ${chainId}`);
  const mailboxAddr = contracts.mailbox;
  const dispatchTopic = utils.addressToBytes32(address);

  if (useExplorer) {
    return fetchLogsFromExplorer(
      [
        `&topic0=${dispatchTopic0}&topic0_1_opr=and&topic1=${dispatchTopic}&topic1_3_opr=or&topic3=${dispatchTopic}`,
        // `&topic0=${processTopic0}&topic0_1_opr=and&topic1=${dispatchTopic}&topic1_3_opr=or&topic3=${dispatchTopic}`,
      ],
      mailboxAddr,
      chainId,
      query,
      multiProvider,
    );
  } else {
    return fetchLogsFromProvider(
      [
        [dispatchTopic0, dispatchTopic],
        [dispatchTopic0, null, null, dispatchTopic],
        // [processTopic0, dispatchTopic],
        // [processTopic0, null, null, dispatchTopic],
      ],
      mailboxAddr,
      chainId,
      query,
      multiProvider,
    );
  }
}

async function fetchLogsForTxHash(
  { chainId }: ChainConfig,
  query: PiMessageQuery,
  multiProvider: MultiProvider,
  useExplorer: boolean,
): Promise<ExtendedLog[]> {
  const txHash = query.input;
  logger.debug(`Fetching logs for txHash ${txHash} on chain ${chainId}`);
  if (useExplorer) {
    try {
      const txReceipt = await queryExplorerForTxReceipt(multiProvider, chainId, txHash, false);
      logger.debug(`Tx receipt found from explorer for chain ${chainId}`);
      const block = await queryExplorerForBlock(
        multiProvider,
        chainId,
        txReceipt.blockNumber,
        false,
      );
      return txReceipt.logs.map((l) => ({
        ...l,
        timestamp: parseBlockTimestamp(block),
        from: txReceipt.from,
        to: txReceipt.to,
      }));
    } catch (error) {
      logger.debug(`Tx hash not found in explorer for chain ${chainId}`);
    }
  } else {
    const provider = multiProvider.getProvider(chainId);
    const txReceipt = await provider.getTransactionReceipt(txHash);
    if (txReceipt) {
      logger.debug(`Tx receipt found from provider for chain ${chainId}`);
      const block = await tryFetchBlockFromProvider(provider, txReceipt.blockNumber);
      return txReceipt.logs.map((l) => ({
        ...l,
        timestamp: parseBlockTimestamp(block),
        from: txReceipt.from,
        to: txReceipt.to,
      }));
    } else {
      logger.debug(`Tx hash not found from provider for chain ${chainId}`);
    }
  }
  return [];
}

async function fetchLogsForMsgId(
  chainConfig: ChainConfig,
  query: PiMessageQuery,
  multiProvider: MultiProvider,
  useExplorer: boolean,
): Promise<ExtendedLog[]> {
  const { contracts, chainId } = chainConfig;
  const msgId = query.input;
  logger.debug(`Fetching logs for msgId ${msgId} on chain ${chainId}`);
  const mailboxAddr = contracts.mailbox;
  const topic1 = msgId;
  let logs: ExtendedLog[];
  if (useExplorer) {
    logs = await fetchLogsFromExplorer(
      [
        `&topic0=${dispatchIdTopic0}&topic0_1_opr=and&topic1=${topic1}`,
        // `&topic0=${processIdTopic0}&topic0_1_opr=and&topic1=${topic1}`,
      ],
      mailboxAddr,
      chainId,
      query,
      multiProvider,
    );
  } else {
    logs = await fetchLogsFromProvider(
      [
        [dispatchIdTopic0, topic1],
        // [processIdTopic0, topic1],
      ],
      mailboxAddr,
      chainId,
      query,
      multiProvider,
    );
  }

  // Grab first tx hash found in any log and get all logs for that tx
  // Necessary because DispatchId/ProcessId logs don't contain useful info
  if (logs.length) {
    const txHash = logs[0].transactionHash;
    logger.debug('Found tx hash with log with msg id. Hash:', txHash);
    return (
      fetchLogsForTxHash(chainConfig, { ...query, input: txHash }, multiProvider, useExplorer) || []
    );
  }

  return [];
}

async function fetchLogsFromExplorer(
  paths: Array<string>,
  contractAddr: Address,
  chainId: ChainId,
  query: PiMessageQuery,
  multiProvider: MultiProvider,
): Promise<ExtendedLog[]> {
  const fromBlock = query.fromBlock || '1';
  const toBlock = query.toBlock || 'latest';
  const base = `module=logs&action=getLogs&fromBlock=${fromBlock}&toBlock=${toBlock}&address=${contractAddr}`;
  let logs: ExtendedLog[] = [];
  for (const path of paths) {
    // Originally use parallel requests here with Promise.all but immediately hit rate limit errors
    const result = await queryExplorerForLogs(multiProvider, chainId, `${base}${path}`, false);
    logs = [...logs, ...result.map(toProviderLog)];
  }
  return logs;
}

async function fetchLogsFromProvider(
  topics: Array<Array<string | null>>,
  contractAddr: Address,
  chainId: ChainId,
  query: PiMessageQuery,
  multiProvider: MultiProvider,
): Promise<ExtendedLog[]> {
  const provider = multiProvider.getProvider(chainId);
  const latestBlock = await provider.getBlockNumber();
  const fromBlock = query.fromBlock || latestBlock - PROVIDER_LOGS_BLOCK_WINDOW;
  const toBlock = query.toBlock || 'latest';
  // TODO may need chunking here to avoid RPC errors
  const logs = (
    await Promise.all(
      topics.map((t) =>
        provider.getLogs({
          fromBlock,
          toBlock,
          address: contractAddr,
          topics: t,
        }),
      ),
    )
  ).flat();

  const timestamps: Record<number, number | undefined> = {};
  const logsWithTimestamp = await Promise.all<ExtendedLog>(
    logs.map(async (l) => {
      const blockNum = l.blockNumber;
      if (!timestamps[blockNum]) {
        const block = await tryFetchBlockFromProvider(provider, blockNum, latestBlock);
        timestamps[blockNum] = parseBlockTimestamp(block);
      }
      return {
        ...l,
        timestamp: timestamps[blockNum],
      };
    }),
  );
  return logsWithTimestamp;
}

async function tryFetchBlockFromProvider(
  provider: providers.Provider,
  blockNum: number,
  latestBlock?: number,
) {
  try {
    if (latestBlock && latestBlock - blockNum > PROVIDER_BLOCK_DETAILS_WINDOW) return null;
    logger.debug('Fetching block details for blockNum:', blockNum);
    const block = await provider.getBlock(blockNum);
    return block;
  } catch (error) {
    logger.debug('Could not fetch block details for blockNum:', blockNum);
    return null;
  }
}

function parseBlockTimestamp(block: providers.Block | null): number | undefined {
  if (!block) return undefined;
  return BigNumber.from(block.timestamp).toNumber() * 1000;
}

function logToMessage(
  multiProvider: MultiProvider,
  log: ExtendedLog,
  chainConfig: ChainConfig,
): Message | null {
  let logDesc: ethers.utils.LogDescription;
  try {
    logDesc = mailbox.parseLog(log);
    if (logDesc.name.toLowerCase() !== 'dispatch') return null;
  } catch (error) {
    // Probably not a message log, ignore
    return null;
  }

  try {
    const bytes = logDesc.args['message'];
    const message = utils.parseMessage(bytes);
    const msgId = utils.messageId(bytes);
    const sender = normalizeAddress(utils.bytes32ToAddress(message.sender));
    const recipient = normalizeAddress(utils.bytes32ToAddress(message.recipient));
    const originChainId = multiProvider.getChainId(message.origin);
    const destinationChainId = multiProvider.getChainId(message.destination);

    return {
      id: '', // No db id exists
      msgId,
      sender,
      recipient,
      status: MessageStatus.Unknown, // TODO
      nonce: message.nonce,
      originChainId,
      destinationChainId,
      originDomainId: message.origin,
      destinationDomainId: message.destination,
      body: message.body,
      origin: {
        timestamp: log.timestamp || 0,
        hash: log.transactionHash,
        from: log.from ? normalizeAddress(log.from) : constants.AddressZero,
        to: log.to ? normalizeAddress(log.to) : constants.AddressZero,
        blockHash: log.blockHash,
        blockNumber: BigNumber.from(log.blockNumber).toNumber(),
        mailbox: chainConfig.contracts.mailbox,
        nonce: 0,
        // TODO get more gas info from tx
        gasLimit: 0,
        gasPrice: 0,
        effectiveGasPrice: 0,
        gasUsed: 0,
        cumulativeGasUsed: 0,
        maxFeePerGas: 0,
        maxPriorityPerGas: 0,
      },
      isPiMsg: true,
    };
  } catch (error) {
    logger.error('Unable to parse log into message', error);
    return null;
  }
}

// Fetch and sum all IGP gas payments for a given message
async function tryFetchIgpGasPayments(
  message: Message,
  chainConfig: ChainConfig,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _multiProvider: MultiProvider,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _useExplorer?: boolean,
): Promise<Message> {
  const { chainId, contracts } = chainConfig;
  const igpAddr = contracts.interchainGasPaymaster;
  if (!igpAddr || !isValidAddress(igpAddr)) {
    logger.warn('No IGP address found for chain:', chainId);
    return message;
  }

  // TODO implement gas payment fetching
  // Mimic logic in debugger's tryCheckIgpGasFunded
  // Either duplicate or refactor into shared util built on SmartProvider

  return message;
}
