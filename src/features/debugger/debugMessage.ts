// Based on debug script in monorepo
// https://github.com/hyperlane-xyz/hyperlane-monorepo/blob/main/typescript/infra/scripts/debug-message.ts
import { providers } from 'ethers';

import { IMessageRecipient__factory, Inbox } from '@hyperlane-xyz/core';
import {
  ChainName,
  DispatchedMessage,
  DomainIdToChainName,
  HyperlaneCore,
  MultiProvider,
  chainConnectionConfigs,
} from '@hyperlane-xyz/sdk';
import { utils } from '@hyperlane-xyz/utils';

import { Environment } from '../../consts/environments';
import { errorToString } from '../../utils/errors';
import { logger } from '../../utils/logger';
import { chunk } from '../../utils/string';

import { debugStatusToDesc } from './strings';
import {
  LinkProperty,
  MessageDebugDetails,
  MessageDebugResult,
  MessageDebugStatus,
  TxDebugStatus,
} from './types';

export async function debugMessagesForHash(
  txHash: string,
  environment: Environment,
  attemptGetProcessTx = true,
): Promise<MessageDebugResult> {
  // TODO use RPC with api keys
  const multiProvider = new MultiProvider(chainConnectionConfigs);

  const txDetails = await findTransactionDetails(txHash, multiProvider);
  if (!txDetails?.transactionReceipt) {
    return {
      status: TxDebugStatus.NotFound,
      details: 'No transaction found for this hash on any supported networks.',
    };
  }

  const { chainName, transactionReceipt } = txDetails;
  return debugMessagesForTransaction(
    chainName,
    transactionReceipt,
    environment,
    attemptGetProcessTx,
    multiProvider,
  );
}

export async function debugMessagesForTransaction(
  chainName: ChainName,
  txReceipt: providers.TransactionReceipt,
  environment: Environment,
  attemptGetProcessTx = true,
  multiProvider = new MultiProvider(chainConnectionConfigs),
): Promise<MessageDebugResult> {
  const explorerLink = getTxExplorerLink(multiProvider, chainName, txReceipt.transactionHash);
  const core = HyperlaneCore.fromEnvironment(environment, multiProvider);
  const dispatchedMessages = core.getDispatchedMessages(txReceipt);

  if (!dispatchedMessages?.length) {
    return {
      status: TxDebugStatus.NoMessages,
      details:
        'No messages found for this transaction. Please check that the hash and environment are set correctly.',
      chainName,
      explorerLink,
    };
  }

  logger.debug(`Found ${dispatchedMessages.length} messages`);
  const messageDetails: MessageDebugDetails[] = [];
  for (let i = 0; i < dispatchedMessages.length; i++) {
    logger.debug(`Checking message ${i + 1} of ${dispatchedMessages.length}`);
    messageDetails.push(
      await checkMessage(core, multiProvider, dispatchedMessages[i], attemptGetProcessTx),
    );
    logger.debug(`Done checking message ${i + 1}`);
  }
  return {
    status: TxDebugStatus.MessagesFound,
    chainName,
    explorerLink,
    messageDetails,
  };
}

async function findTransactionDetails(txHash: string, multiProvider: MultiProvider) {
  const chains = multiProvider.chains().filter((n) => !n.startsWith('test'));
  const chainChunks = chunk(chains, 10);
  for (const chunk of chainChunks) {
    try {
      const queries = chunk.map((c) => fetchTransactionDetails(txHash, multiProvider, c));
      const result = await Promise.any(queries);
      return result;
    } catch (error) {
      logger.debug('Tx not found, trying next chunk');
    }
  }
  logger.debug('Tx not found on any networks');
  return null;
}

async function fetchTransactionDetails(
  txHash: string,
  multiProvider: MultiProvider,
  chainName: ChainName,
) {
  const { provider } = multiProvider.getChainConnection(chainName);
  // TODO explorer may be faster, more robust way to get tx and its logs
  // Note: receipt is null if tx not found
  const transactionReceipt = await provider.getTransactionReceipt(txHash);
  if (transactionReceipt) {
    logger.info('Tx found', txHash, chainName);
    return { chainName, transactionReceipt };
  } else {
    logger.debug('Tx not found', txHash, chainName);
    throw new Error(`Tx not found on ${chainName}`);
  }
}

async function checkMessage(
  core: HyperlaneCore<any>,
  multiProvider: MultiProvider<any>,
  message: DispatchedMessage,
  attemptGetProcessTx = true,
) {
  logger.debug(JSON.stringify(message));
  const properties = new Map<string, string | LinkProperty>();

  if (message.parsed.sender.toString().startsWith('0x000000000000000000000000')) {
    const originChainName = DomainIdToChainName[message.parsed.origin];
    const originCC = multiProvider.getChainConnection(originChainName);
    const address = '0x' + message.parsed.sender.toString().substring(26);
    properties.set('Sender', { url: await originCC.getAddressUrl(address), text: address });
  } else {
    properties.set('Sender', message.parsed.sender.toString());
  }
  if (message.parsed.recipient.toString().startsWith('0x000000000000000000000000')) {
    const destinationChainName = DomainIdToChainName[message.parsed.destination];
    const destinationCC = multiProvider.getChainConnection(destinationChainName);
    const address = '0x' + message.parsed.recipient.toString().substring(26);
    properties.set('Recipient', { url: await destinationCC.getAddressUrl(address), text: address });
  } else {
    properties.set('Recipient', message.parsed.recipient.toString());
  }
  properties.set('Origin Domain', message.parsed.origin.toString());
  properties.set('Origin Chain', DomainIdToChainName[message.parsed.origin] || 'Unknown');
  properties.set('Destination Domain', message.parsed.destination.toString());
  properties.set('Destination Chain', DomainIdToChainName[message.parsed.destination] || 'Unknown');
  properties.set('Leaf index', message.leafIndex.toString());
  properties.set('Raw Bytes', message.message);

  const destinationChain = DomainIdToChainName[message.parsed.destination];

  if (!destinationChain) {
    logger.info(`Unknown destination domain ${message.parsed.destination}`);
    return {
      status: MessageDebugStatus.InvalidDestDomain,
      properties,
      summary: `${
        debugStatusToDesc[MessageDebugStatus.InvalidDestDomain]
      } Note, domain ids usually do not match chain ids. See https://docs.hyperlane.xyz/hyperlane-docs/developers/domains`,
    };
  }

  logger.debug(`Destination chain: ${destinationChain}`);

  if (!core.knownChain(destinationChain)) {
    logger.info(`Destination chain ${destinationChain} unknown for environment`);
    return {
      status: MessageDebugStatus.UnknownDestChain,
      properties,
      summary: `${
        debugStatusToDesc[MessageDebugStatus.UnknownDestChain]
      } Did you set the right environment in the top right picker? See https://docs.hyperlane.xyz/hyperlane-docs/developers/domains`,
    };
  }

  const destinationInbox = core.getMailboxPair(
    DomainIdToChainName[message.parsed.origin],
    destinationChain,
  ).destinationInbox;

  const messageHash = utils.messageHash(message.message, message.leafIndex);
  logger.debug(`Message hash: ${messageHash}`);

  const processed = await destinationInbox.messages(messageHash);
  if (processed === 1) {
    logger.info('Message has already been processed');
    if (attemptGetProcessTx) {
      const processTxHash = await tryGetProcessTxHash(destinationInbox, messageHash);
      if (processTxHash) {
        const url = getTxExplorerLink(multiProvider, destinationChain, processTxHash) || '';
        properties.set('Process TX', { url, text: processTxHash });
      }
    }
    return {
      status: MessageDebugStatus.AlreadyProcessed,
      properties,
      summary: debugStatusToDesc[MessageDebugStatus.AlreadyProcessed],
    };
  } else {
    logger.debug('Message not yet processed');
  }

  const recipientAddress = utils.bytes32ToAddress(message.parsed.recipient);
  const recipientIsContract = await isContract(multiProvider, destinationChain, recipientAddress);

  if (!recipientIsContract) {
    logger.info(`Recipient address ${recipientAddress} is not a contract`);
    return {
      status: MessageDebugStatus.RecipientNotContract,
      properties,
      summary: `${
        debugStatusToDesc[MessageDebugStatus.AlreadyProcessed]
      } Addr: ${recipientAddress}. Ensure bytes32 value is not malformed.`,
    };
  }

  const destinationProvider = multiProvider.getChainProvider(destinationChain);
  const recipient = IMessageRecipient__factory.connect(recipientAddress, destinationProvider);

  try {
    await recipient.estimateGas.handle(
      message.parsed.origin,
      message.parsed.sender,
      message.parsed.body,
      { from: destinationInbox.address },
    );
    logger.debug('Calling recipient `handle` function from the inbox does not revert');
    return {
      status: MessageDebugStatus.NoErrorsFound,
      properties,
      summary: debugStatusToDesc[MessageDebugStatus.NoErrorsFound],
    };
  } catch (err: any) {
    const messagePrefix = debugStatusToDesc[MessageDebugStatus.HandleCallFailure];
    logger.info(messagePrefix);
    const errorString = errorToString(err);
    logger.debug(errorString);

    // scan bytecode for handle function selector
    const bytecode = await destinationProvider.getCode(recipientAddress);
    const msgRecipientInterface = IMessageRecipient__factory.createInterface();
    const handleFunction = msgRecipientInterface.functions['handle(uint32,bytes32,bytes)'];
    const handleSignature = msgRecipientInterface.getSighash(handleFunction);
    if (!bytecode.includes(handleSignature.slice(2))) {
      const bytecodeMessage = `${
        debugStatusToDesc[MessageDebugStatus.RecipientNotHandler]
      } ${handleSignature}. Contract may be proxied.`;
      logger.info(bytecodeMessage);
      return {
        status: MessageDebugStatus.RecipientNotHandler,
        properties,
        // TODO format the error string better to be easier to understand
        summary: `${messagePrefix}. ${bytecodeMessage}`,
      };
    }

    return {
      status: MessageDebugStatus.HandleCallFailure,
      properties,
      // TODO format the error string better to be easier to understand
      summary: `${messagePrefix}. Details: ${errorString}`,
    };
  }
}

async function isContract(multiProvider: MultiProvider<any>, chain: ChainName, address: string) {
  const provider = multiProvider.getChainProvider(chain);
  const code = await provider.getCode(address);
  // "Empty" code
  return code && code !== '0x';
}

// TODO reconcile with function in utils/explorers.ts
// must reconcile wagmi consts and sdk consts
function getTxExplorerLink(multiProvider: MultiProvider<any>, chain: ChainName, hash: string) {
  const url = multiProvider
    .getChainConnection(chain)
    // @ts-ignore
    .getTxUrl({ hash });
  return url || undefined;
}

// TODO use explorer for this instead of RPC to avoid block age limitations
// In doing so, de-dupe with features/search/useMessageProcessTx.ts
async function tryGetProcessTxHash(destinationInbox: Inbox, messageHash: string) {
  try {
    const filter = destinationInbox.filters.Process(messageHash);
    const matchedEvents = await destinationInbox.queryFilter(filter);
    if (matchedEvents?.length) {
      const event = matchedEvents[0];
      return event.transactionHash;
    }
  } catch (error) {
    logger.error('Error finding process transaction', error);
  }
  return null;
}
