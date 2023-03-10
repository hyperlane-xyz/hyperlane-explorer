import { useQuery } from '@tanstack/react-query';
import { BigNumber, constants, ethers, providers } from 'ethers';

import { Mailbox__factory } from '@hyperlane-xyz/core';
import { MultiProvider } from '@hyperlane-xyz/sdk';
import { utils } from '@hyperlane-xyz/utils';

import { getMultiProvider } from '../../../multiProvider';
import { useStore } from '../../../store';
import { Message, MessageStatus, PartialTransactionReceipt } from '../../../types';
import {
  ensureLeading0x,
  isValidAddress,
  isValidTransactionHash,
  normalizeAddress,
} from '../../../utils/addresses';
import {
  queryExplorerForBlock,
  queryExplorerForLogs,
  queryExplorerForTxReceipt,
  toProviderLog,
} from '../../../utils/explorers';
import { logger } from '../../../utils/logger';
import { ChainConfig } from '../../chains/chainConfig';

import { LogWithTimestamp } from './types';
import { isValidSearchQuery } from './useMessageQuery';

const PROVIDER_LOGS_BLOCK_WINDOW = 100_000;
const PROVIDER_BLOCK_DETAILS_WINDOW = 5_000;

const mailbox = Mailbox__factory.createInterface();
const dispatchTopic0 = mailbox.getEventTopic('Dispatch');
const dispatchIdTopic0 = mailbox.getEventTopic('DispatchId');
// const processTopic0 = mailbox.getEventTopic('Process');
// const processIdTopic0 = mailbox.getEventTopic('ProcessId');

// Query 'Permissionless Interoperability (PI)' chains using custom
// chain configs in store state
export function usePiChainMessageQuery(
  sanitizedInput: string,
  startTimeFilter: number | null,
  endTimeFilter: number | null,
  pause: boolean,
) {
  const chainConfigs = useStore((s) => s.chainConfigs);
  const { isLoading, isError, data } = useQuery(
    ['usePiChainMessageQuery', chainConfigs, sanitizedInput, startTimeFilter, endTimeFilter, pause],
    async () => {
      const hasInput = !!sanitizedInput;
      const isValidInput = isValidSearchQuery(sanitizedInput, true);
      if (pause || !hasInput || !isValidInput || !Object.keys(chainConfigs).length) return null;
      logger.debug('Starting PI Chain message query for:', sanitizedInput);
      // TODO convert timestamps to from/to blocks here
      const query = { input: ensureLeading0x(sanitizedInput) };
      const multiProvider = getMultiProvider();
      try {
        const messages = await Promise.any(
          Object.values(chainConfigs).map((c) => fetchMessagesOrThrow(c, query, multiProvider)),
        );
        return messages;
      } catch (e) {
        logger.debug('Starting PI messages found for:', sanitizedInput);
        return [];
      }
    },
    { retry: false },
  );

  return {
    isFetching: isLoading,
    isError,
    hasRun: !!data,
    messageList: data || [],
  };
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

export interface PiMessageQuery {
  input: string;
  fromBlock?: string | number;
  toBlock?: string | number;
}

async function fetchMessagesOrThrow(
  chainConfig: ChainConfig,
  query: PiMessageQuery,
  multiProvider: MultiProvider,
): Promise<Message[]> {
  const messages = await fetchMessagesFromPiChain(chainConfig, query, multiProvider);
  // Throw so Promise.any caller doesn't trigger
  if (!messages.length) throw new Error(`No messages found for chain ${chainConfig.chainId}`);
  return messages;
}

export async function fetchMessagesFromPiChain(
  chainConfig: ChainConfig,
  query: PiMessageQuery,
  multiProvider: MultiProvider,
): Promise<Message[]> {
  const useExplorer = !!chainConfig.blockExplorers?.[0]?.apiUrl;
  const input = query.input;

  let logs: LogWithTimestamp[];
  if (isValidAddress(input)) {
    logs = await fetchLogsForAddress(chainConfig, query, multiProvider, useExplorer);
  } else if (isValidTransactionHash(input)) {
    logs = await fetchLogsForTxHash(chainConfig, query, multiProvider, useExplorer);
    // Input may be a msg id, check that next
    if (!logs.length) {
      logs = await fetchLogsForMsgId(chainConfig, query, multiProvider, useExplorer);
    }
  } else {
    logger.warn('Invalid PI search input', input);
    return [];
  }

  return logs.map(logToMessage).filter((m): m is Message => !!m);
}

async function fetchLogsForAddress(
  { chainId, contracts }: ChainConfig,
  query: PiMessageQuery,
  multiProvider: MultiProvider,
  useExplorer?: boolean,
): Promise<LogWithTimestamp[]> {
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
): Promise<LogWithTimestamp[]> {
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
        timestamp: BigNumber.from(block.timestamp).toNumber() * 1000,
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
      // TODO make timestamp optional instead of using 0 fallback here
      const timestamp = block ? BigNumber.from(block.timestamp).toNumber() * 1000 : 0;
      return txReceipt.logs.map((l) => ({
        ...l,
        timestamp,
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
): Promise<LogWithTimestamp[]> {
  const { contracts, chainId } = chainConfig;
  const msgId = query.input;
  logger.debug(`Fetching logs for msgId ${msgId} on chain ${chainId}`);
  const mailboxAddr = contracts.mailbox;
  const topic1 = msgId;
  let logs: LogWithTimestamp[];
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
    logger.debug('Found tx hash with log of msg id', txHash);
    return (
      fetchLogsForTxHash(chainConfig, { ...query, input: txHash }, multiProvider, useExplorer) || []
    );
  }

  return [];
}

async function fetchLogsFromExplorer(
  paths: Array<string>,
  contractAddr: Address,
  chainId: number,
  query: PiMessageQuery,
  multiProvider: MultiProvider,
): Promise<LogWithTimestamp[]> {
  const fromBlock = query.fromBlock || '1';
  const toBlock = query.toBlock || 'latest';
  const base = `module=logs&action=getLogs&fromBlock=${fromBlock}&toBlock=${toBlock}&address=${contractAddr}`;
  let logs: LogWithTimestamp[] = [];
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
  chainId: number,
  query: PiMessageQuery,
  multiProvider: MultiProvider,
): Promise<LogWithTimestamp[]> {
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

  const timestamps: Record<number, number> = {};
  const logsWithTimestamp = await Promise.all<LogWithTimestamp>(
    logs.map(async (l) => {
      const blockNum = l.blockNumber;
      if (!timestamps[blockNum]) {
        const block = await tryFetchBlockFromProvider(provider, blockNum, latestBlock);
        // TODO make timestamps optional instead of using 0 fallback here
        const timestamp = block ? BigNumber.from(block.timestamp).toNumber() * 1000 : 0;
        timestamps[blockNum] = timestamp;
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

function logToMessage(log: LogWithTimestamp): Message | null {
  let logDesc: ethers.utils.LogDescription;
  try {
    logDesc = mailbox.parseLog(log);
    if (logDesc.name.toLowerCase() !== 'dispatch') return null;
  } catch (error) {
    // Probably not a message log, ignore
    return null;
  }

  const bytes = logDesc.args['message'];
  const message = utils.parseMessage(bytes);

  const tx: PartialTransactionReceipt = {
    from: log.from ? normalizeAddress(log.from) : constants.AddressZero,
    transactionHash: log.transactionHash,
    blockNumber: BigNumber.from(log.blockNumber).toNumber(),
    timestamp: log.timestamp,
    gasUsed: 0, //TODO
  };

  const multiProvider = getMultiProvider();

  return {
    id: '', // No db id exists
    msgId: utils.messageId(bytes),
    status: MessageStatus.Unknown, // TODO
    sender: normalizeAddress(utils.bytes32ToAddress(message.sender)),
    recipient: normalizeAddress(utils.bytes32ToAddress(message.recipient)),
    originDomainId: message.origin,
    destinationDomainId: message.destination,
    originChainId: multiProvider.getChainId(message.origin),
    destinationChainId: multiProvider.getChainId(message.destination),
    originTimestamp: log.timestamp,
    nonce: message.nonce,
    body: message.body,
    originTransaction: tx,
    isPiMsg: true,
  };
}
