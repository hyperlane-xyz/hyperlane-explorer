import { BigNumber, constants, ethers, providers } from 'ethers';

import { IInterchainGasPaymaster__factory, Mailbox__factory } from '@hyperlane-xyz/core';
import { IRegistry } from '@hyperlane-xyz/registry';
import { ChainMetadata, MultiProvider } from '@hyperlane-xyz/sdk';
import {
  ProtocolType,
  addressToBytes32,
  bytes32ToAddress,
  isValidAddress,
  isValidTransactionHash,
  messageId,
  normalizeAddress,
  parseMessage,
} from '@hyperlane-xyz/utils';

import { PI_MESSAGE_LOG_CHECK_BLOCK_RANGE } from '../../../consts/values';
import { ExtendedLog, Message, MessageStatus } from '../../../types';
import { logger } from '../../../utils/logger';

const mailbox = Mailbox__factory.createInterface();
const dispatchTopic0 = mailbox.getEventTopic('Dispatch');
const dispatchIdTopic0 = mailbox.getEventTopic('DispatchId');
// const processTopic0 = mailbox.getEventTopic('Process');
// const processIdTopic0 = mailbox.getEventTopic('ProcessId');

export interface PiMessageQuery {
  input: string;
  fromBlock?: providers.BlockTag;
  toBlock?: providers.BlockTag;
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
  chainMetadata: ChainMetadata,
  query: PiMessageQuery,
  multiProvider: MultiProvider,
  registry: IRegistry,
  queryType?: PiQueryType, // optionally force search down to just one type
): Promise<Message[]> {
  const input = query.input;

  let logs: ExtendedLog[] = [];
  if (isValidAddress(input) && (!queryType || queryType === PiQueryType.Address)) {
    logs = await fetchLogsForAddress(chainMetadata, query, multiProvider, registry);
  } else if (isValidTransactionHash(input, ProtocolType.Ethereum)) {
    if (!queryType || queryType === PiQueryType.TxHash) {
      logs = await fetchLogsForTxHash(chainMetadata, query, multiProvider);
    }
    // Input may be a msg id, check that next
    if ((!queryType || queryType === PiQueryType.MsgId) && !logs.length) {
      logs = await fetchLogsForMsgId(chainMetadata, query, multiProvider, registry);
    }
  } else {
    logger.warn('Invalid PI search input', input, queryType);
    return [];
  }

  const messages = logs
    .map((l) => logToMessage(multiProvider, l, chainMetadata))
    .filter((m): m is Message => !!m);

  // Fetch IGP gas payments for each message if it's a small set
  if (messages.length < 5) {
    const messagesWithGasPayments: Message[] = [];
    // Avoiding parallelism here out of caution for RPC rate limits
    for (const m of messages) {
      messagesWithGasPayments.push(await tryFetchIgpGasPayments(m, chainMetadata, multiProvider));
    }
    return messagesWithGasPayments;
  } else {
    // Otherwise skip IGP gas fetching
    return messages;
  }
}

async function fetchLogsForAddress(
  chainMetadata: ChainMetadata,
  query: PiMessageQuery,
  multiProvider: MultiProvider,
  registry: IRegistry,
): Promise<ExtendedLog[]> {
  const { name, domainId } = chainMetadata;
  const address = query.input;
  logger.debug(`Fetching logs for address ${address} on chain ${name} (${domainId})`);
  const mailbox = await resolveMailbox(chainMetadata, registry);
  if (!mailbox) return [];
  const dispatchTopic = addressToBytes32(address);

  return fetchLogsFromProvider(
    [
      [dispatchTopic0, dispatchTopic],
      [dispatchTopic0, null, null, dispatchTopic],
      // [processTopic0, dispatchTopic],
      // [processTopic0, null, null, dispatchTopic],
    ],
    mailbox,
    domainId,
    query,
    multiProvider,
  );
}

async function fetchLogsForTxHash(
  { name, domainId }: ChainMetadata,
  query: PiMessageQuery,
  multiProvider: MultiProvider,
): Promise<ExtendedLog[]> {
  const txHash = query.input;
  logger.debug(`Fetching logs for txHash ${txHash} on chain ${name} (${domainId})`);
  const provider = multiProvider.getProvider(domainId);
  const txReceipt = await provider.getTransactionReceipt(txHash);
  if (txReceipt) {
    logger.debug(`Tx receipt found from provider for chain ${name} (${domainId})`);
    const block = await tryFetchBlockFromProvider(provider, txReceipt.blockNumber);
    return txReceipt.logs.map((l) => ({
      ...l,
      timestamp: parseBlockTimestamp(block),
      from: txReceipt.from,
      to: txReceipt.to,
    }));
  } else {
    logger.debug(`Tx hash not found from provider for chain ${name} (${domainId})`);
    return [];
  }
}

async function fetchLogsForMsgId(
  chainMetadata: ChainMetadata,
  query: PiMessageQuery,
  multiProvider: MultiProvider,
  registry: IRegistry,
): Promise<ExtendedLog[]> {
  const { name, domainId } = chainMetadata;
  const msgId = query.input;
  logger.debug(`Fetching logs for msgId ${msgId} on chain ${name} (${domainId})`);
  const mailbox = await resolveMailbox(chainMetadata, registry);
  if (!mailbox) return [];
  const topic1 = msgId;
  const logs: ExtendedLog[] = await fetchLogsFromProvider(
    [
      [dispatchIdTopic0, topic1],
      // [processIdTopic0, topic1],
    ],
    mailbox,
    domainId,
    query,
    multiProvider,
  );

  // Grab first tx hash found in any log and get all logs for that tx
  // Necessary because DispatchId/ProcessId logs don't contain useful info
  if (logs.length) {
    const txHash = logs[0].transactionHash;
    logger.debug('Found tx hash with log with msg id. Hash:', txHash);
    return fetchLogsForTxHash(chainMetadata, { ...query, input: txHash }, multiProvider) || [];
  }

  return [];
}

async function fetchLogsFromProvider(
  topics: Array<Array<string | null>>,
  contractAddr: Address,
  domainId: DomainId,
  query: PiMessageQuery,
  multiProvider: MultiProvider,
): Promise<ExtendedLog[]> {
  const provider = multiProvider.getProvider(domainId);

  let { fromBlock, toBlock } = query;
  fromBlock ||= (await provider.getBlockNumber()) - PI_MESSAGE_LOG_CHECK_BLOCK_RANGE;
  toBlock ||= 'latest';

  let logs: providers.Log[] = [];
  for (const t of topics) {
    logs = logs.concat(
      await provider.getLogs({
        fromBlock,
        toBlock,
        address: contractAddr,
        topics: t,
      }),
    );
  }

  // Too many logs to also fetch timestamps
  if (logs.length > 10) return logs;

  const logsWithTimestamp: ExtendedLog[] = [];
  const timestamps: Record<number, number | null> = {};
  for (const l of logs) {
    const blockNum = l.blockNumber;
    if (timestamps[blockNum] === undefined) {
      const block = await tryFetchBlockFromProvider(provider, blockNum);
      timestamps[blockNum] = parseBlockTimestamp(block) ?? null;
    }
    logsWithTimestamp.push({ ...l, timestamp: timestamps[blockNum] ?? undefined });
  }
  return logsWithTimestamp;
}

async function tryFetchBlockFromProvider(provider: providers.Provider, blockNum: number) {
  try {
    logger.debug('Fetching block details for blockNum:', blockNum);
    const block = await provider.getBlock(blockNum);
    return block;
  } catch (error) {
    logger.debug('Could not fetch block details for blockNum:', blockNum);
    return null;
  }
}

function parseBlockTimestamp(block: providers.Block | null | undefined): number | undefined {
  if (!block) return undefined;
  return BigNumber.from(block.timestamp).toNumber() * 1000;
}

function logToMessage(
  multiProvider: MultiProvider,
  log: ExtendedLog,
  chainMetadata: ChainMetadata<{ mailbox?: Address }>,
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
    const message = parseMessage(bytes);
    const msgId = messageId(bytes);
    const sender = normalizeAddress(bytes32ToAddress(message.sender));
    const recipient = normalizeAddress(bytes32ToAddress(message.recipient));
    const originChainId = multiProvider.getChainId(message.origin);
    const destinationChainId =
      multiProvider.tryGetChainId(message.destination) || message.destination;

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
        mailbox: chainMetadata.mailbox || constants.AddressZero,
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
  chainMetadata: ChainMetadata<{ interchainGasPaymaster?: Address }>,
  multiProvider: MultiProvider,
): Promise<Message> {
  const { name, domainId, interchainGasPaymaster } = chainMetadata;
  if (!interchainGasPaymaster || !isValidAddress(interchainGasPaymaster)) {
    logger.warn(`No IGP address found for chain ${name} (${domainId})`);
    return message;
  }

  const igp = IInterchainGasPaymaster__factory.connect(
    interchainGasPaymaster,
    multiProvider.getProvider(domainId),
  );
  const filter = igp.filters.GasPayment(message.msgId);
  const matchedEvents = (await igp.queryFilter(filter)) || [];
  logger.debug(`Found ${matchedEvents.length} payments to IGP for msg ${message.msgId}`);
  let totalGasAmount = BigNumber.from(0);
  let totalPayment = BigNumber.from(0);
  for (const payment of matchedEvents) {
    totalGasAmount = totalGasAmount.add(payment.args.gasAmount);
    totalPayment = totalPayment.add(payment.args.payment);
  }

  return {
    ...message,
    totalGasAmount: totalGasAmount.toString(),
    totalPayment: totalPayment.toString(),
    numPayments: matchedEvents.length,
  };
}

async function resolveMailbox(
  chainMetadata: ChainMetadata<{ mailbox?: Address }>,
  registry: IRegistry,
) {
  if (chainMetadata.mailbox) return chainMetadata.mailbox;
  const chainName = chainMetadata.name;
  const chainAddresses = await registry.getChainAddresses(chainName);
  const mailbox = chainAddresses?.mailbox;
  if (!mailbox) logger.debug(`No mailbox address found for chain ${chainName}`);
  return mailbox;
}
