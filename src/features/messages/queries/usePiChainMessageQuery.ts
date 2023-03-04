import { useQuery } from '@tanstack/react-query';
import { providers } from 'ethers';

import { Mailbox__factory } from '@hyperlane-xyz/core';
import { utils } from '@hyperlane-xyz/utils';

import { getMultiProvider, getProvider } from '../../../multiProvider';
import { useStore } from '../../../store';
import { Message, MessageStatus } from '../../../types';
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

const mailbox = Mailbox__factory.createInterface();
const dispatchTopic0 = mailbox.getEventTopic('Dispatch');
const dispatchIdTopic0 = mailbox.getEventTopic('DispatchId');
const processTopic0 = mailbox.getEventTopic('Process');
const processIdTopic0 = mailbox.getEventTopic('ProcessId');

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

async function fetchMessagesFromPiChain(
  chainConfig: ChainConfig,
  input: string,
): Promise<Message[]> {
  const { chainId, blockExplorers } = chainConfig;
  const useExplorer = !!blockExplorers?.[0]?.apiUrl;

  let logs: providers.Log[] | null = null;
  if (isValidAddressFast(input)) {
    logs = await fetchLogsForAddress(chainConfig, input, useExplorer);
  } else if (isValidTransactionHash(input)) {
    logs = await fetchLogsForTxHash(chainConfig, input, useExplorer);
    if (!logs) {
      // Input may be a msg id
      logs = await fetchLogsForMsgId(chainConfig, input, useExplorer);
    }
  } else {
    throw new Error('Invalid PI search input');
  }

  if (!logs?.length) {
    // Throw so Promise.any caller doesn't trigger
    throw new Error(`No messages found for chain ${chainId}`);
  }

  return logs.map(logToMessage);
}

async function fetchLogsForAddress(
  { chainId, contracts }: ChainConfig,
  address: Address,
  useExplorer?: boolean,
) {
  const mailboxAddr = contracts.mailbox;
  const dispatchTopic1 = ensureLeading0x(address);
  const dispatchTopic3 = utils.addressToBytes32(dispatchTopic1);
  const processTopic1 = dispatchTopic3;
  const processTopic3 = dispatchTopic1;

  if (useExplorer) {
    return fetchLogsFromExplorer(
      [
        `&topic0=${dispatchTopic0}&topic0_1_opr=and&topic1=${dispatchTopic1}&topic1_3_opr=or&topic3=${dispatchTopic3}`,
        `&topic0=${processTopic0}&topic0_1_opr=and&topic1=${processTopic1}&topic1_3_opr=or&topic3=${processTopic3}`,
      ],
      mailboxAddr,
      chainId,
    );
  } else {
    return fetchLogsFromProvider(
      [
        [dispatchTopic0, dispatchTopic1],
        [dispatchTopic0, null, null, dispatchTopic3],
        [processTopic0, processTopic1],
        [processTopic0, null, null, processTopic3],
      ],
      mailboxAddr,
      chainId,
    );
  }
}

async function fetchLogsForTxHash({ chainId }: ChainConfig, txHash: string, useExplorer: boolean) {
  if (useExplorer) {
    try {
      const txReceipt = await queryExplorerForTxReceipt(chainId, txHash);
      logger.debug(`Tx receipt found from explorer for chain ${chainId}`);
      console.log(txReceipt);
      return txReceipt.logs;
    } catch (error) {
      logger.debug(`Tx hash not found in explorer for chain ${chainId}`);
      return null;
    }
  } else {
    const provider = getProvider(chainId);
    const txReceipt = await provider.getTransactionReceipt(txHash);
    console.log(txReceipt);
    if (txReceipt) {
      logger.debug(`Tx receipt found from provider for chain ${chainId}`);
      return txReceipt.logs;
    } else {
      logger.debug(`Tx hash not found from provider for chain ${chainId}`);
      return null;
    }
  }
}

async function fetchLogsForMsgId(chainConfig: ChainConfig, msgId: string, useExplorer: boolean) {
  const { contracts, chainId } = chainConfig;
  const mailboxAddr = contracts.mailbox;
  const topic1 = ensureLeading0x(msgId);
  let logs: providers.Log[];
  if (useExplorer) {
    logs = await fetchLogsFromExplorer(
      [
        `&topic0=${dispatchIdTopic0}&topic0_1_opr=and&topic1=${topic1}`,
        `&topic0=${processIdTopic0}&topic0_1_opr=and&topic1=${topic1}`,
      ],
      mailboxAddr,
      chainId,
    );
  } else {
    logs = await fetchLogsFromProvider(
      [
        [dispatchTopic0, topic1],
        [processTopic0, topic1],
      ],
      mailboxAddr,
      chainId,
    );
  }

  if (logs.length) {
    const txHash = logs[0].transactionHash;
    logger.debug('Found tx hash with log of msg id', txHash);
    return fetchLogsForTxHash(chainConfig, txHash, useExplorer) || [];
  }

  return [];
}

async function fetchLogsFromExplorer(paths: Array<string>, contractAddr: Address, chainId: number) {
  const pathBase = `api?module=logs&action=getLogs&fromBlock=0&toBlock=999999999&address=${contractAddr}`;
  const logs = (
    await Promise.all(paths.map((p) => queryExplorerForLogs(chainId, `${pathBase}${p}`)))
  )
    .flat()
    .map(toProviderLog);
  console.log(logs);
  return logs;
}

async function fetchLogsFromProvider(
  topics: Array<Array<string | null>>,
  contractAddr: Address,
  chainId: number,
) {
  const provider = getProvider(chainId);
  // TODO may need chunking here to avoid RPC errors
  const logs = (
    await Promise.all(
      topics.map((t) =>
        provider.getLogs({
          address: contractAddr,
          topics: t,
        }),
      ),
    )
  ).flat();
  console.log(logs);
  return logs;
}

function logToMessage(log: providers.Log): Message {
  const multiProvider = getMultiProvider();
  const bytes = mailbox.parseLog(log).args['message'];
  const parsed = utils.parseMessage(bytes);
  return {
    id: '', // No db id exists
    msgId: utils.messageId(bytes),
    status: MessageStatus.Pending, // TODO
    sender: parsed.sender,
    recipient: parsed.recipient,
    originDomainId: parsed.origin,
    destinationDomainId: parsed.destination,
    originChainId: multiProvider.getChainId(parsed.origin),
    destinationChainId: multiProvider.getChainId(parsed.destination),
    originTimestamp: 0, // TODO
    destinationTimestamp: undefined, // TODO
    nonce: parsed.nonce,
    body: parsed.body,
    originTransaction: {
      from: '0x', //TODO
      transactionHash: log.transactionHash,
      blockNumber: log.blockNumber,
      gasUsed: 0,
      timestamp: 0, //TODO
    },
    destinationTransaction: undefined, // TODO
  };
}
