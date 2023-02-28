import { useQuery } from '@tanstack/react-query';
import { providers } from 'ethers';

import { Mailbox__factory } from '@hyperlane-xyz/core';
import { utils } from '@hyperlane-xyz/utils';

import { useStore } from '../../../store';
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
    async () => {
      const hasInput = !!sanitizedInput;
      const isValidInput = isValidSearchQuery(sanitizedInput, true);
      if (pause || !hasInput || !isValidInput || !Object.keys(chainConfigs).length) return null;
      logger.debug('Starting PI Chain message query for:', sanitizedInput);
      const messages = await Promise.any(
        Object.values(chainConfigs).map((c) => fetchMessagesFromPiChain(c, sanitizedInput)),
      );
      return messages;
    },
    { retry: false },
  );

  return {
    isFetching: isLoading,
    isError,
    messageList: data,
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

async function fetchMessagesFromPiChain(chainConfig: ChainConfig, input: string) {
  const { chainId, blockExplorers, publicRpcUrls } = chainConfig;
  // TODO get from multiprovider
  const blockExplorerUrl = blockExplorers?.[0]?.apiUrl || blockExplorers?.[0]?.url;
  const rpcUrl = publicRpcUrls[0].http;

  let logs: providers.Log[] | null = null;
  if (isValidAddressFast(input)) {
    logs = await fetchLogsForAddress(chainConfig, input, rpcUrl, blockExplorerUrl);
  } else if (isValidTransactionHash(input)) {
    logs = await fetchLogsForTxHash(chainConfig, input, rpcUrl, blockExplorerUrl);
    if (!logs) {
      // Input may be a msg id
      logs = await fetchLogsForMsgId(chainConfig, input, rpcUrl, blockExplorerUrl);
    }
  } else {
    throw new Error('Invalid PI search input');
  }
  const parsedMessages =
    logs?.map((log) => utils.parseMessage(mailbox.parseLog(log).args['message'])) || [];
  if (parsedMessages.length) logger.debug(`Parsed ${parsedMessages.length} for chain ${chainId}`);
  return parsedMessages;
}

async function fetchLogsForAddress(
  { chainId, contracts }: ChainConfig,
  address: Address,
  rpcUrl: string,
  blockExplorerUrl,
) {
  const mailboxAddr = contracts.mailbox;
  const dispatchTopic1 = ensureLeading0x(address);
  const dispatchTopic3 = utils.addressToBytes32(dispatchTopic1);
  const processTopic1 = dispatchTopic3;
  const processTopic3 = dispatchTopic1;

  if (blockExplorerUrl) {
    const pathBase = `api?module=logs&action=getLogs&fromBlock=0&toBlock=999999999&address=${mailboxAddr}`;
    const dispatchLogsPath = `${pathBase}&topic0=${dispatchTopic0}&topic0_1_opr=and&topic1=${dispatchTopic1}&topic1_3_opr=or&topic3=${dispatchTopic3}`;
    const processLogsPath = `${pathBase}&topic0=${processTopic0}&topic0_1_opr=and&topic1=${processTopic1}&topic1_3_opr=or&topic3=${processTopic3}`;
    // TODO these need to accept PI chain ids, currently won't work
    const logs = (
      await Promise.all([
        queryExplorerForLogs(chainId, dispatchLogsPath, dispatchTopic0),
        queryExplorerForLogs(chainId, processLogsPath, processTopic0),
      ])
    )
      .flat()
      .map(toProviderLog);
    console.log(logs);
    return logs;
  } else {
    // TODO get provider from multiProvider so it's cached
    const provider = new providers.JsonRpcProvider(rpcUrl);
    const queryProvider = (topics: Array<string | null>) =>
      provider.getLogs({
        address: mailboxAddr,
        topics,
      });
    const logs = (
      await Promise.all([
        queryProvider([dispatchTopic0, dispatchTopic1]),
        queryProvider([dispatchTopic0, null, null, dispatchTopic3]),
        queryProvider([processTopic0, processTopic1]),
        queryProvider([processTopic0, null, null, processTopic3]),
      ])
    ).flat();
    console.log(logs);
    return logs;
  }
}

async function fetchLogsForTxHash(
  { chainId }: ChainConfig,
  txHash: string,
  rpcUrl: string,
  blockExplorerUrl,
) {
  if (blockExplorerUrl) {
    // TODO these need to accept PI chain ids, currently won't work
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
    // TODO MP
    const provider = new providers.JsonRpcProvider(rpcUrl);
    const txReceipt = await provider.getTransactionReceipt(txHash);
    console.log(txReceipt);
    if (!txReceipt) {
      logger.debug(`Tx hash not found from provider for chain ${chainId}`);
      return null;
    } else {
      logger.debug(`Tx receipt found from provider for chain ${chainId}`);
      return txReceipt.logs;
    }
  }
}

async function fetchLogsForMsgId(
  { chainId, contracts }: ChainConfig,
  msgId: string,
  rpcUrl: string,
  blockExplorerUrl,
) {
  //   logs = dataSource.getLogs() where:
  //   contract is mailbox
  //   topic0 is DispatchId or ProcessId
  //   topic1 is input
  // hash = logs[0].txHash
  // GOTO hash search above
  return [];
}
