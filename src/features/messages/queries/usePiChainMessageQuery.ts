import { useQuery } from '@tanstack/react-query';
import { BigNumber, constants, ethers, providers } from 'ethers';

import { Mailbox__factory } from '@hyperlane-xyz/core';
import { utils } from '@hyperlane-xyz/utils';

import { getMultiProvider, getProvider } from '../../../multiProvider';
import { useStore } from '../../../store';
import { Message, MessageStatus, PartialTransactionReceipt } from '../../../types';
import {
  ensureLeading0x,
  isValidAddressFast,
  isValidTransactionHash,
} from '../../../utils/addresses';
import {
  queryExplorerForLogs,
  queryExplorerForTxReceipt,
  toProviderLog,
} from '../../../utils/explorers';
import { logger } from '../../../utils/logger';
import { ChainConfig } from '../../chains/chainConfig';

import { isValidSearchQuery } from './useMessageQuery';

const PROVIDER_LOGS_BLOCK_WINDOW = 150_000;

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
    () => {
      const hasInput = !!sanitizedInput;
      const isValidInput = isValidSearchQuery(sanitizedInput, true);
      if (pause || !hasInput || !isValidInput || !Object.keys(chainConfigs).length) return null;
      logger.debug('Starting PI Chain message query for:', sanitizedInput);
      return Promise.any(
        Object.values(chainConfigs).map((c) => fetchMessagesFromPiChain(c, sanitizedInput)),
      );
    },
    { retry: false },
  );

  return {
    isFetching: isLoading,
    isError,
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

export async function fetchMessagesFromPiChain(
  chainConfig: ChainConfig,
  input: string,
): Promise<Message[]> {
  const { chainId, blockExplorers } = chainConfig;
  const useExplorer = !!blockExplorers?.[0]?.apiUrl;
  const formattedInput = ensureLeading0x(input);

  let logs: providers.Log[];
  if (isValidAddressFast(formattedInput)) {
    logs = await fetchLogsForAddress(chainConfig, formattedInput, useExplorer);
  } else if (isValidTransactionHash(input)) {
    logs = await fetchLogsForTxHash(chainConfig, formattedInput, useExplorer);
    if (!logs.length) {
      // Input may be a msg id
      logs = await fetchLogsForMsgId(chainConfig, formattedInput, useExplorer);
    }
  } else {
    throw new Error('Invalid PI search input');
  }

  if (!logs.length) {
    // Throw so Promise.any caller doesn't trigger
    throw new Error(`No messages found for chain ${chainId}`);
  }

  return logs.map(logToMessage).filter((m): m is Message => !!m);
}

async function fetchLogsForAddress(
  { chainId, contracts }: ChainConfig,
  address: Address,
  useExplorer?: boolean,
) {
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
    );
  }
}

async function fetchLogsForTxHash({ chainId }: ChainConfig, txHash: string, useExplorer: boolean) {
  logger.debug(`Fetching logs for txHash ${txHash} on chain ${chainId}`);
  if (useExplorer) {
    try {
      const txReceipt = await queryExplorerForTxReceipt(chainId, txHash, false);
      logger.debug(`Tx receipt found from explorer for chain ${chainId}`);
      return txReceipt.logs;
    } catch (error) {
      logger.debug(`Tx hash not found in explorer for chain ${chainId}`);
    }
  } else {
    const provider = getProvider(chainId);
    const txReceipt = await provider.getTransactionReceipt(txHash);
    if (txReceipt) {
      logger.debug(`Tx receipt found from provider for chain ${chainId}`);
      return txReceipt.logs;
    } else {
      logger.debug(`Tx hash not found from provider for chain ${chainId}`);
    }
  }
  return [];
}

async function fetchLogsForMsgId(chainConfig: ChainConfig, msgId: string, useExplorer: boolean) {
  const { contracts, chainId } = chainConfig;
  logger.debug(`Fetching logs for msgId ${msgId} on chain ${chainId}`);
  const mailboxAddr = contracts.mailbox;
  const topic1 = msgId;
  let logs: providers.Log[];
  if (useExplorer) {
    logs = await fetchLogsFromExplorer(
      [
        `&topic0=${dispatchIdTopic0}&topic0_1_opr=and&topic1=${topic1}`,
        // `&topic0=${processIdTopic0}&topic0_1_opr=and&topic1=${topic1}`,
      ],
      mailboxAddr,
      chainId,
    );
  } else {
    logs = await fetchLogsFromProvider(
      [
        [dispatchIdTopic0, topic1],
        // [processIdTopic0, topic1],
      ],
      mailboxAddr,
      chainId,
    );
  }

  // Grab first tx hash found in any log and get all logs for that tx
  // Necessary because DispatchId/ProcessId logs don't contain useful info
  if (logs.length) {
    const txHash = logs[0].transactionHash;
    logger.debug('Found tx hash with log of msg id', txHash);
    return fetchLogsForTxHash(chainConfig, txHash, useExplorer) || [];
  }

  return [];
}

async function fetchLogsFromExplorer(paths: Array<string>, contractAddr: Address, chainId: number) {
  const base = `?module=logs&action=getLogs&fromBlock=0&toBlock=999999999&address=${contractAddr}`;
  let logs: providers.Log[] = [];
  for (const path of paths) {
    // Originally use parallel requests here with Promise.all but immediately hit rate limit errors
    const result = await queryExplorerForLogs(chainId, `${base}${path}`, undefined, false);
    logs = [...logs, ...result.map(toProviderLog)];
  }
  return logs;
}

async function fetchLogsFromProvider(
  topics: Array<Array<string | null>>,
  contractAddr: Address,
  chainId: number,
) {
  const provider = getProvider(chainId);
  const latestBlock = await provider.getBlockNumber();
  // TODO may need chunking here to avoid RPC errors
  const logs = (
    await Promise.all(
      topics.map((t) =>
        provider.getLogs({
          fromBlock: latestBlock - PROVIDER_LOGS_BLOCK_WINDOW,
          toBlock: 'latest',
          address: contractAddr,
          topics: t,
        }),
      ),
    )
  ).flat();
  return logs;
}

function logToMessage(log: providers.Log): Message | null {
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
    from: constants.AddressZero, //TODO
    transactionHash: log.transactionHash,
    blockNumber: BigNumber.from(log.blockNumber).toNumber(),
    gasUsed: 0, //TODO
    timestamp: 0, // TODO
  };
  const emptyTx = {
    from: constants.AddressZero, //TODO
    transactionHash: constants.HashZero,
    blockNumber: 0,
    gasUsed: 0,
    timestamp: 0,
  };

  const multiProvider = getMultiProvider();

  return {
    id: '', // No db id exists
    msgId: utils.messageId(bytes),
    status: MessageStatus.Unknown, // TODO
    sender: message.sender,
    recipient: message.recipient,
    originDomainId: message.origin,
    destinationDomainId: message.destination,
    originChainId: multiProvider.getChainId(message.origin),
    destinationChainId: multiProvider.getChainId(message.destination),
    originTimestamp: tx.timestamp, // TODO
    destinationTimestamp: 0, // TODO
    nonce: message.nonce,
    body: message.body,
    originTransaction: tx,
    destinationTransaction: emptyTx,
  };
}
