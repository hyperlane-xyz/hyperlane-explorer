// Based on debug script in monorepo
// https://github.com/hyperlane-xyz/hyperlane-monorepo/blob/main/typescript/infra/scripts/debug-message.ts
import { BigNumber, providers } from 'ethers';

import { IMessageRecipient__factory, Mailbox } from '@hyperlane-xyz/core';
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
import { trimLeading0x } from '../../utils/addresses';
import { errorToString } from '../../utils/errors';
import { logger } from '../../utils/logger';
import { chunk, trimToLength } from '../../utils/string';
import { isIcaMessage, tryDecodeIcaBody, tryFetchIcaAddress } from '../messages/ica';

import {
  LinkProperty,
  MessageDebugDetails,
  MessageDebugResult,
  MessageDebugStatus,
  TxDebugStatus,
} from './types';

const HANDLE_FUNCTION_SIG = 'handle(uint32,bytes32,bytes)';

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
    undefined,
    attemptGetProcessTx,
    multiProvider,
  );
}

export async function debugMessagesForTransaction(
  chainName: ChainName,
  txReceipt: providers.TransactionReceipt,
  environment: Environment,
  nonce?: number,
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
    const msg = dispatchedMessages[i];
    if (nonce && !BigNumber.from(msg.parsed.nonce).eq(nonce)) {
      logger.debug(`Skipping message ${i + 1}, does not match nonce ${nonce}`);
      continue;
    }
    logger.debug(`Checking message ${i + 1} of ${dispatchedMessages.length}`);
    messageDetails.push(await checkMessage(core, multiProvider, msg, attemptGetProcessTx));
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
): Promise<MessageDebugDetails> {
  logger.debug(JSON.stringify(message));
  const {
    sender: senderBytes,
    recipient: recipientBytes,
    body,
    destination,
    origin,
    nonce,
  } = message.parsed;
  const messageId = utils.messageId(message.message);
  const senderAddress = utils.bytes32ToAddress(senderBytes.toString());
  const recipientAddress = utils.bytes32ToAddress(recipientBytes.toString());

  const properties = new Map<string, string | LinkProperty>();
  properties.set('ID', messageId);
  properties.set('Sender', senderAddress);
  properties.set('Recipient', recipientAddress);
  properties.set('Origin Domain', origin.toString());
  properties.set('Origin Chain', DomainIdToChainName[origin] || 'Unknown');
  properties.set('Destination Domain', destination.toString());
  properties.set('Destination Chain', DomainIdToChainName[destination] || 'Unknown');
  properties.set('Nonce', nonce.toString());
  properties.set('Raw Bytes', message.message);

  const destinationChain = DomainIdToChainName[destination];
  logger.debug(`Destination chain: ${destinationChain}`);
  if (!destinationChain) {
    logger.info(`Unknown destination domain ${destination}`);
    return {
      status: MessageDebugStatus.InvalidDestDomain,
      properties,
      details: `No chain found for domain ${destination}. Some Domain IDs do not match Chain IDs. See https://docs.hyperlane.xyz/hyperlane-docs/developers/domains`,
    };
  }

  if (!core.knownChain(destinationChain)) {
    logger.info(`Destination chain ${destinationChain} unknown for environment`);
    return {
      status: MessageDebugStatus.UnknownDestChain,
      properties,
      details: `Hyperlane has multiple environments. See https://docs.hyperlane.xyz/hyperlane-docs/developers/domains`,
    };
  }

  const destinationMailbox = core.getContracts(destinationChain).mailbox.contract;
  const isDelivered = await destinationMailbox.delivered(messageId);

  if (isDelivered) {
    logger.info('Message has already been processed');
    if (attemptGetProcessTx) {
      const processTxHash = await tryGetProcessTxHash(destinationMailbox, messageId);
      if (processTxHash) {
        const url = getTxExplorerLink(multiProvider, destinationChain, processTxHash) || '';
        properties.set('Process TX', { url, text: processTxHash });
      }
    }
    return {
      status: MessageDebugStatus.AlreadyProcessed,
      properties,
      details: 'See delivery transaction for more details',
    };
  } else {
    logger.debug('Message not yet processed');
  }

  const recipientIsContract = await isContract(multiProvider, destinationChain, recipientAddress);
  if (!recipientIsContract) {
    logger.info(`Recipient address ${recipientAddress} is not a contract`);
    return {
      status: MessageDebugStatus.RecipientNotContract,
      properties,
      details: `Recipient address is ${recipientAddress}. Ensure that the bytes32 value is not malformed.`,
    };
  }

  const destinationProvider = multiProvider.getChainProvider(destinationChain);
  const recipientContract = IMessageRecipient__factory.connect(
    recipientAddress,
    destinationProvider,
  );
  try {
    await recipientContract.estimateGas.handle(origin, senderBytes, body, {
      from: destinationMailbox.address,
    });
    logger.debug('Calling recipient `handle` function from the inbox does not revert');
    return {
      status: MessageDebugStatus.NoErrorsFound,
      properties,
      details: 'Message may just need more time to be processed',
    };
  } catch (err: any) {
    logger.info('Estimate gas call failed');

    const errorReason = extractReasonString(err);
    logger.debug(errorReason);

    const bytecodeHasHandle = await tryCheckBytecodeHandle(destinationProvider, recipientAddress);
    if (!bytecodeHasHandle) {
      logger.info('Bytecode does not have function matching handle sig');
      return {
        status: MessageDebugStatus.RecipientNotHandler,
        properties,
        details: `Recipient contract should have handle function of signature: ${HANDLE_FUNCTION_SIG}. Check that recipient is not a proxy. Error: ${errorReason}`,
      };
    }

    const icaCallError = await checkIcaMessageError(
      senderAddress,
      recipientAddress,
      body,
      origin,
      destinationProvider,
    );
    if (icaCallError) {
      return {
        status: MessageDebugStatus.IcaCallFailure,
        properties,
        details: icaCallError,
      };
    }

    return {
      status: MessageDebugStatus.HandleCallFailure,
      properties,
      details: errorReason,
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
async function tryGetProcessTxHash(destinationMailbox: Mailbox, messageId: string) {
  try {
    const filter = destinationMailbox.filters.ProcessId(messageId);
    const matchedEvents = await destinationMailbox.queryFilter(filter);
    if (matchedEvents?.length) {
      const event = matchedEvents[0];
      return event.transactionHash;
    }
  } catch (error) {
    logger.error('Error finding process transaction', error);
  }
  return null;
}

async function tryCheckBytecodeHandle(
  destinationProvider: providers.Provider,
  recipientAddress: string,
) {
  try {
    // scan bytecode for handle function selector
    const bytecode = await destinationProvider.getCode(recipientAddress);
    const msgRecipientInterface = IMessageRecipient__factory.createInterface();
    const handleFunction = msgRecipientInterface.functions[HANDLE_FUNCTION_SIG];
    const handleSignature = msgRecipientInterface.getSighash(handleFunction);
    return bytecode.includes(trimLeading0x(handleSignature));
  } catch (error) {
    logger.error('Error checking bytecode for handle fn', error);
    return true;
  }
}

async function checkIcaMessageError(
  sender: string,
  recipient: string,
  body: string,
  originDomainId: number,
  destinationProvider: providers.Provider,
) {
  if (!isIcaMessage({ sender, recipient })) return null;
  logger.debug('Message is for an ICA');

  const decodedBody = tryDecodeIcaBody(body);
  if (!decodedBody) return null;

  const { sender: originalSender, calls } = decodedBody;

  const icaAddress = await tryFetchIcaAddress(originDomainId, originalSender);
  if (!icaAddress) return null;

  for (let i = 0; i < calls.length; i++) {
    const call = calls[i];
    logger.debug(`Checking ica call ${i + 1} of ${calls.length}`);
    const errorReason = await tryCheckIcaCallError(
      icaAddress,
      call.destinationAddress,
      call.callBytes,
      destinationProvider,
    );
    if (errorReason) {
      return `ICA call ${i + 1} of ${calls.length} cannot be executed. ${errorReason}`;
    }
  }

  return null;
}

async function tryCheckIcaCallError(
  icaAddress: string,
  destinationAddress: string,
  callBytes: string,
  destinationProvider: providers.Provider,
) {
  try {
    await destinationProvider.estimateGas({
      to: destinationAddress,
      data: callBytes,
      from: icaAddress,
    });
    logger.debug(`No call error found for call from ${icaAddress} to ${destinationAddress}`);
    return null;
  } catch (err) {
    const errorReason = extractReasonString(err);
    logger.debug(`Call error found from ${icaAddress} to ${destinationAddress}`, errorReason);
    return errorReason;
  }
}

function extractReasonString(rawError: any) {
  const errorString = errorToString(rawError, 1000);
  const ethersReasonRegex = /reason="(.*?)"/gm;
  const matches = ethersReasonRegex.exec(errorString);
  if (matches && matches.length >= 2) {
    return `Failure reason: ${matches[1]}`;
  } else {
    logger.warn('Cannot extract reason string in tx error msg:', errorString);
    // TODO handle more cases here as needed
    return `Failure reason: ${trimToLength(errorString, 250)}`;
  }
}
