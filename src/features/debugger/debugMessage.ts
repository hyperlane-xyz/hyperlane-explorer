// Forked from debug script in monorepo
// https://github.com/hyperlane-xyz/hyperlane-monorepo/blob/main/typescript/infra/scripts/debug-message.ts
import { BigNumber, providers } from 'ethers';

import {
  IMessageRecipient__factory,
  type InterchainGasPaymaster,
  type Mailbox,
} from '@hyperlane-xyz/core';
import {
  ChainName,
  CoreChainName,
  DispatchedMessage,
  HyperlaneCore,
  MultiProvider,
  TestChains,
} from '@hyperlane-xyz/sdk';
import { utils } from '@hyperlane-xyz/utils';

import { Environment } from '../../consts/environments';
import { getMultiProvider } from '../../multiProvider';
import { Message } from '../../types';
import { trimLeading0x } from '../../utils/addresses';
import { fromWei } from '../../utils/amount';
import { errorToString } from '../../utils/errors';
import { logger } from '../../utils/logger';
import { chunk, trimToLength } from '../../utils/string';
import { getChainEnvironment } from '../chains/utils';
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
  multiProvider = getMultiProvider(),
): Promise<MessageDebugResult> {
  const txDetails = await findTransactionDetails(txHash, multiProvider);
  if (!txDetails?.transactionReceipt) {
    return {
      status: TxDebugStatus.NotFound,
      details: 'No transaction found for this hash on any supported networks.',
    };
  }

  const { chainName, transactionReceipt } = txDetails;
  return debugMessagesForTransaction(chainName, transactionReceipt, environment, multiProvider);
}

export async function debugMessagesForTransaction(
  chainName: ChainName,
  txReceipt: providers.TransactionReceipt,
  environment: Environment,
  multiProvider = getMultiProvider(),
  nonce?: number,
): Promise<MessageDebugResult> {
  // TODO PI support here
  const core = HyperlaneCore.fromEnvironment(environment, multiProvider);
  const dispatchedMessages = core.getDispatchedMessages(txReceipt);

  const explorerLink =
    multiProvider.tryGetExplorerTxUrl(chainName, {
      hash: txReceipt.transactionHash,
    }) || undefined;

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
    messageDetails.push(await debugDispatchedMessage(core, multiProvider, msg));
    logger.debug(`Done checking message ${i + 1}`);
  }
  return {
    status: TxDebugStatus.MessagesFound,
    chainName,
    explorerLink,
    messageDetails,
  };
}

async function debugDispatchedMessage(
  core: HyperlaneCore,
  multiProvider: MultiProvider,
  message: DispatchedMessage,
): Promise<MessageDebugDetails> {
  const {
    sender: senderBytes,
    recipient: recipientBytes,
    origin: originDomain,
    destination: destDomain,
    body,
    nonce,
  } = message.parsed;
  const messageId = utils.messageId(message.message);
  const senderAddr = utils.bytes32ToAddress(senderBytes.toString());
  const recipientAddr = utils.bytes32ToAddress(recipientBytes.toString());
  const originName = multiProvider.getChainName(originDomain);
  const destName = multiProvider.tryGetChainName(destDomain)!;

  const properties = new Map<string, string | LinkProperty>();
  properties.set('ID', messageId);
  properties.set('Sender', senderAddr);
  properties.set('Recipient', recipientAddr);
  properties.set('Origin Domain', originDomain.toString());
  properties.set('Origin Chain', originName);
  properties.set('Destination Domain', destDomain.toString());
  properties.set('Destination Chain', destName || 'Unknown');
  properties.set('Nonce', nonce.toString());
  properties.set('Raw Bytes', message.message);

  const destInvalid = isInvalidDestDomain(core, destDomain, destName);
  if (destInvalid) return { ...destInvalid, properties };

  const messageDelivered = await isMessageAlreadyDelivered(
    core,
    multiProvider,
    destName,
    messageId,
    properties,
  );
  if (messageDelivered) return { ...messageDelivered, properties };

  const destProvider = multiProvider.getProvider(destName);
  const recipInvalid = await isInvalidRecipient(destProvider, recipientAddr);
  if (recipInvalid) return { ...recipInvalid, properties };

  const deliveryResult = await debugMessageDelivery(
    core,
    originDomain,
    destName,
    senderAddr,
    recipientAddr,
    senderBytes,
    body,
    destProvider,
  );
  if (deliveryResult.status && deliveryResult.details) return { ...deliveryResult, properties };
  const gasEstimate = deliveryResult.gasEstimate;

  const insufficientGas = await isIgpUnderfunded(
    core,
    messageId,
    originName,
    destDomain,
    gasEstimate,
  );
  if (insufficientGas) return { ...insufficientGas, properties };

  return noErrorFound(properties);
}

export async function debugExplorerMessage(
  message: Message,
  multiProvider = getMultiProvider(),
): Promise<Omit<MessageDebugDetails, 'properties'>> {
  const {
    msgId,
    sender,
    recipient,
    originDomainId: originDomain,
    destinationDomainId: destDomain,
    body,
    totalPayment,
  } = message;
  logger.debug(`Debugging message id: ${msgId}`);

  const originName = multiProvider.getChainName(originDomain);
  const destName = multiProvider.tryGetChainName(destDomain)!;
  const environment = getChainEnvironment(originName);
  // TODO PI support here
  const core = HyperlaneCore.fromEnvironment(environment, multiProvider);

  const destInvalid = isInvalidDestDomain(core, destDomain, destName);
  if (destInvalid) return destInvalid;

  const destProvider = multiProvider.getProvider(destName);
  const recipInvalid = await isInvalidRecipient(destProvider, recipient);
  if (recipInvalid) return recipInvalid;

  const senderBytes = utils.addressToBytes32(sender);
  const deliveryResult = await debugMessageDelivery(
    core,
    originDomain,
    destName,
    sender,
    recipient,
    senderBytes,
    body,
    destProvider,
  );
  if (deliveryResult.status && deliveryResult.details) return deliveryResult;
  const gasEstimate = deliveryResult.gasEstimate;

  const insufficientGas = await isIgpUnderfunded(
    core,
    msgId,
    originName,
    destDomain,
    gasEstimate,
    totalPayment,
  );
  if (insufficientGas) return insufficientGas;

  return noErrorFound();
}

async function findTransactionDetails(txHash: string, multiProvider: MultiProvider) {
  const chains = multiProvider
    .getKnownChainNames()
    .filter((n) => !TestChains.includes(n as CoreChainName));
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
  const provider = multiProvider.getProvider(chainName);
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

function isInvalidDestDomain(core: HyperlaneCore, destDomain: number, destName: string | null) {
  logger.debug(`Destination chain: ${destName}`);
  if (!destName) {
    logger.info(`Unknown destination domain ${destDomain}`);
    return {
      status: MessageDebugStatus.InvalidDestDomain,
      details: `No chain found for domain ${destDomain}. Some Domain IDs do not match Chain IDs. See https://docs.hyperlane.xyz/docs/resources/domains`,
    };
  }
  if (!core.knownChain(destName)) {
    logger.info(`Destination chain ${destName} unknown for environment`);
    return {
      status: MessageDebugStatus.UnknownDestChain,
      details: `Hyperlane has multiple environments. See https://docs.hyperlane.xyz/docs/resources/domains`,
    };
  }
  return false;
}

async function isMessageAlreadyDelivered(
  core: HyperlaneCore,
  multiProvider: MultiProvider,
  destName: string,
  messageId: string,
  properties: MessageDebugDetails['properties'],
) {
  const destMailbox = core.getContracts(destName).mailbox.contract;
  const isDelivered = await destMailbox.delivered(messageId);

  if (isDelivered) {
    logger.info('Message has already been processed');
    const processTxHash = await tryGetProcessTxHash(destMailbox, messageId);
    if (processTxHash) {
      const url = multiProvider.tryGetExplorerTxUrl(destName, { hash: processTxHash });
      properties.set('Process TX', { url: url || 'UNKNOWN', text: processTxHash });
    }
    return {
      status: MessageDebugStatus.AlreadyProcessed,
      properties,
      details: 'See delivery transaction for more details',
    };
  }

  logger.debug('Message not yet processed');
  return false;
}

async function isInvalidRecipient(provider: providers.Provider, recipient: Address) {
  const recipientIsContract = await isContract(provider, recipient);
  if (!recipientIsContract) {
    logger.info(`Recipient address ${recipient} is not a contract`);
    return {
      status: MessageDebugStatus.RecipientNotContract,
      details: `Recipient address is ${recipient}. Ensure that the bytes32 value is not malformed.`,
    };
  }
  return false;
}

async function isContract(provider: providers.Provider, address: Address) {
  const code = await provider.getCode(address);
  return code && code !== '0x'; // "Empty" code
}

async function debugMessageDelivery(
  core: HyperlaneCore,
  originDomain: number,
  destName: string,
  sender: Address,
  recipient: Address,
  senderBytes: string,
  body: string,
  destProvider: providers.Provider,
) {
  const destMailbox = core.getContracts(destName).mailbox.contract;
  const recipientContract = IMessageRecipient__factory.connect(recipient, destProvider);
  try {
    const deliveryGasEst = await recipientContract.estimateGas.handle(
      originDomain,
      senderBytes,
      body,
      {
        from: destMailbox.address,
      },
    );
    logger.debug(
      `Calling recipient handle function from the inbox does not revert. Gas: ${deliveryGasEst.toString()}`,
    );
    return { gasEstimate: deliveryGasEst.toString() };
  } catch (err: any) {
    logger.info('Estimate gas call failed');
    const errorReason = extractReasonString(err);
    logger.debug(errorReason);

    const bytecodeHasHandle = await tryCheckBytecodeHandle(destProvider, recipient);
    if (!bytecodeHasHandle) {
      logger.info('Bytecode does not have function matching handle sig');
      return {
        status: MessageDebugStatus.RecipientNotHandler,
        details: `Recipient contract should have handle function of signature: ${HANDLE_FUNCTION_SIG}. Check that recipient is not a proxy. Error: ${errorReason}`,
      };
    }

    const icaCallErr = await tryDebugIcaMsg(sender, recipient, body, originDomain, destProvider);
    if (icaCallErr) {
      return {
        status: MessageDebugStatus.IcaCallFailure,
        details: icaCallErr,
      };
    }

    return {
      status: MessageDebugStatus.HandleCallFailure,
      details: errorReason,
    };
  }
}

async function isIgpUnderfunded(
  core: HyperlaneCore,
  msgId: string,
  originName: string,
  destDomain: number,
  deliveryGasEst?: string,
  totalPayment?: string,
) {
  const igp = core.getContracts(originName).interchainGasPaymaster.contract;
  const { isFunded, igpDetails } = await tryCheckIgpGasFunded(
    igp,
    msgId,
    destDomain,
    deliveryGasEst,
    totalPayment,
  );
  if (!isFunded) {
    return {
      status: MessageDebugStatus.GasUnderfunded,
      details: igpDetails,
    };
  }
  return false;
}

async function tryGetProcessTxHash(mailbox: Mailbox, messageId: string) {
  try {
    const filter = mailbox.filters.ProcessId(messageId);
    const matchedEvents = await mailbox.queryFilter(filter);
    if (matchedEvents?.length) {
      const event = matchedEvents[0];
      return event.transactionHash;
    }
  } catch (error) {
    logger.error('Error finding process transaction', error);
  }
  return null;
}

async function tryCheckBytecodeHandle(provider: providers.Provider, recipientAddress: string) {
  try {
    // scan bytecode for handle function selector
    const bytecode = await provider.getCode(recipientAddress);
    const msgRecipientInterface = IMessageRecipient__factory.createInterface();
    const handleFunction = msgRecipientInterface.functions[HANDLE_FUNCTION_SIG];
    const handleSignature = msgRecipientInterface.getSighash(handleFunction);
    return bytecode.includes(trimLeading0x(handleSignature));
  } catch (error) {
    logger.error('Error checking bytecode for handle fn', error);
    return true;
  }
}

async function tryDebugIcaMsg(
  sender: Address,
  recipient: Address,
  body: string,
  originDomainId: number,
  destinationProvider: providers.Provider,
) {
  if (!isIcaMessage({ sender, recipient })) return null;
  logger.debug('Message is for an ICA');

  const decodedBody = tryDecodeIcaBody(body);
  if (!decodedBody) return null;

  const { sender: originalSender, calls } = decodedBody;

  const icaAddress = await tryFetchIcaAddress(originDomainId, originalSender, destinationProvider);
  if (!icaAddress) return null;

  for (let i = 0; i < calls.length; i++) {
    const call = calls[i];
    logger.debug(`Checking ica call ${i + 1} of ${calls.length}`);
    const errorReason = await tryCheckIcaCall(
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

async function tryCheckIcaCall(
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

async function tryCheckIgpGasFunded(
  igp: InterchainGasPaymaster,
  messageId: string,
  destDomain: number,
  deliveryGasEst?: string,
  totalPayment?: string,
) {
  try {
    if (!deliveryGasEst) throw new Error('No gas estimate provided');

    let totalPaid: BigNumber = BigNumber.from(0);
    if (!totalPayment) {
      const filter = igp.filters.GasPayment(messageId, null, null);
      // TODO restrict blocks here to avoid rpc errors
      const matchedEvents = (await igp.queryFilter(filter)) || [];
      logger.debug(`Found ${matchedEvents.length} payments to IGP for msg ${messageId}`);
      logger.debug(matchedEvents);
      for (const payment of matchedEvents) {
        totalPaid = totalPaid.add(payment.args.payment);
      }
    } else {
      logger.debug(`Using totalPayment info from message: ${totalPayment}`);
      totalPaid = BigNumber.from(totalPayment);
    }

    if (totalPaid.lte(0)) {
      logger.debug('Amount paid to IGP is 0, delivery underfunded');
      return { isFunded: false, igpDetails: 'Origin IGP has not received any payments' };
    }
    // TODO this assumes default ISM for messages
    const paymentQuote = await igp.quoteGasPayment(destDomain, deliveryGasEst);
    logger.debug(`IGP paid: ${totalPaid}, payment quote: ${paymentQuote}`);
    if (BigNumber.from(paymentQuote).gt(totalPaid)) {
      logger.debug('Payment to IGP is NOT sufficient');
      const paidEth = fromWei(totalPaid.toString());
      const quoteEth = fromWei(paymentQuote.toString());
      return {
        isFunded: false,
        igpDetails: `Origin IGP has received ${paidEth} but requires ${quoteEth}`,
      };
    } else {
      logger.debug('Payment to IGP is sufficient');
      return { isFunded: true, igpDetails: '' };
    }
  } catch (error) {
    logger.warn('Error estimating delivery gas cost for message', error);
    return { isFunded: true, igpDetails: '' };
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

function noErrorFound(properties?: MessageDebugDetails['properties']): MessageDebugDetails {
  return {
    status: MessageDebugStatus.NoErrorsFound,
    details: 'Message may just need more time to be processed',
    properties: properties || new Map(),
  };
}
