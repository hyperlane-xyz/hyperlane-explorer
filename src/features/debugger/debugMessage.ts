// Forked from debug script in monorepo but mostly rewritten
// https://github.com/hyperlane-xyz/hyperlane-monorepo/blob/main/typescript/infra/scripts/debug-message.ts
import { BigNumber, utils as ethersUtils, providers } from 'ethers';

import {
  InterchainGasPaymaster__factory as InterchainGasPaymasterFactory,
  IInterchainSecurityModule__factory as InterchainSecurityModuleFactory,
  IMailbox__factory as MailboxFactory,
  IMessageRecipient__factory as MessageRecipientFactory,
  IMultisigIsm__factory as MultisigIsmFactory,
} from '@hyperlane-xyz/core';
import { IRegistry } from '@hyperlane-xyz/registry';
import { ChainMap, ChainMetadata, MAILBOX_VERSION, MultiProvider } from '@hyperlane-xyz/sdk';
import {
  addressToBytes32,
  errorToString,
  formatMessage,
  isValidAddress,
  trimToLength,
} from '@hyperlane-xyz/utils';

import { Message } from '../../types';
import { logger } from '../../utils/logger';
import { getMailboxAddress } from '../chains/utils';
import { isIcaMessage, tryDecodeIcaBody, tryFetchIcaAddress } from '../messages/ica';

import { debugIgnoredChains } from '../../consts/config';
import { GasPayment, IsmModuleTypes, MessageDebugResult, MessageDebugStatus } from './types';

type Provider = providers.Provider;

// const HANDLE_FUNCTION_SIG = 'handle(uint32,bytes32,bytes)';
const IGP_PAYMENT_CHECK_DELAY = 30_000; // 30 seconds

export async function debugMessage(
  multiProvider: MultiProvider,
  registry: IRegistry,
  overrideChainMetadata: ChainMap<Partial<ChainMetadata>>,
  {
    msgId,
    nonce,
    sender,
    recipient,
    origin,
    originDomainId: originDomain,
    destinationDomainId: destDomain,
    body,
    totalGasAmount,
    isPiMsg,
  }: Message,
): Promise<MessageDebugResult> {
  logger.debug(`Debugging message id: ${msgId}`);

  // Prepare some useful data/encodings
  const messageBytes = formatMessage(
    MAILBOX_VERSION,
    nonce,
    originDomain,
    sender,
    destDomain,
    recipient,
    body,
  );
  const destName = multiProvider.tryGetChainName(destDomain)!;
  const originProvider = multiProvider.getProvider(originDomain);
  const destProvider = multiProvider.getProvider(destDomain);
  const senderBytes = addressToBytes32(sender);

  // Create a bag to hold all the useful info collected along the way
  const details: Omit<MessageDebugResult, 'status' | 'description'> = {};

  const recipInvalid = await isInvalidRecipient(destProvider, recipient);
  if (recipInvalid) return recipInvalid;

  const destMailbox = await getMailboxAddress(destName, overrideChainMetadata, registry);
  if (!destMailbox)
    throw new Error(`Cannot debug message, no mailbox address provided for chain ${destName}`);

  const deliveryResult = await debugMessageDelivery(
    originDomain,
    destMailbox,
    destProvider,
    sender,
    recipient,
    senderBytes,
    body,
    destName,
  );
  if (deliveryResult.status && deliveryResult.description) return deliveryResult;
  else details.calldataDetails = deliveryResult.calldataDetails;

  const ismCheckResult = await checkMultisigIsmEmpty(
    recipient,
    messageBytes,
    destMailbox,
    destProvider,
  );
  if (ismCheckResult.status && ismCheckResult.description) return { ...ismCheckResult, ...details };
  else details.ismDetails = ismCheckResult.ismDetails;

  // TODO support for non-default IGP gas checks here
  // Disabling for now for https://github.com/hyperlane-xyz/hyperlane-monorepo/issues/3668
  // Also skipping if the message is still very new otherwise this raises premature
  // underfunded errors when in fact payment was made
  if (!isPiMsg && Date.now() - origin.timestamp > IGP_PAYMENT_CHECK_DELAY) {
    const gasCheckResult = await tryCheckIgpGasFunded(
      msgId,
      originProvider,
      deliveryResult.gasEstimate,
      totalGasAmount,
    );
    if (gasCheckResult?.status && gasCheckResult?.description)
      return { ...gasCheckResult, ...details };
    else details.gasDetails = gasCheckResult?.gasDetails;
  }

  logger.debug(`No errors found debugging message id: ${msgId}`);
  return {
    ...noErrorFound(),
    ...details,
  };
}

async function isInvalidRecipient(provider: Provider, recipient: Address) {
  const recipientIsContract = await isContract(provider, recipient);
  if (!recipientIsContract) {
    logger.info(`Recipient address ${recipient} is not a contract`);
    return {
      status: MessageDebugStatus.RecipientNotContract,
      description: `Recipient address is ${recipient}. Ensure that the bytes32 value is not malformed.`,
    };
  }
  return false;
}

async function isContract(provider: Provider, address: Address) {
  const code = await provider.getCode(address);
  return code && code !== '0x'; // "Empty" code
}

async function debugMessageDelivery(
  originDomain: DomainId,
  destMailbox: Address,
  destProvider: Provider,
  sender: Address,
  recipient: Address,
  senderBytes: string,
  body: string,
  destName: string,
) {
  const recipientContract = MessageRecipientFactory.connect(recipient, destProvider);
  const handleCalldata = recipientContract.interface.encodeFunctionData('handle', [
    originDomain,
    senderBytes,
    body,
  ]);
  const calldataDetails = { handleCalldata, contract: recipient, mailbox: destMailbox };
  try {
    // TODO add special case for Arbitrum:
    // TODO account for mailbox handling gas overhead
    // https://github.com/hyperlane-xyz/hyperlane-monorepo/pull/1949/files#diff-79ec1cf679507919c08a9a66e0407c16fff22aee98d79cf39a0c1baf086403ebR364
    const deliveryGasEst = await recipientContract.estimateGas.handle(
      originDomain,
      senderBytes,
      body,
      { from: destMailbox },
    );
    logger.debug(
      `Calling recipient handle function from the inbox does not revert. Gas: ${deliveryGasEst.toString()}`,
    );
    return { gasEstimate: deliveryGasEst.toString(), calldataDetails };
  } catch (err: any) {
    logger.info('Estimate gas call failed:', err);
    const errorReason = extractReasonString(err);
    logger.debug(errorReason);

    // const bytecodeHasHandle = await tryCheckBytecodeHandle(destProvider, recipient);
    // if (!bytecodeHasHandle) {
    //   logger.info('Bytecode does not have function matching handle sig');
    //   return {
    //     status: MessageDebugStatus.RecipientNotHandler,
    //     description: `Recipient contract should have handle function of signature: ${HANDLE_FUNCTION_SIG}. Check that recipient is not a proxy. Error: ${errorReason}`,
    //     calldataDetails,
    //   };
    // }

    if (debugIgnoredChains.includes(destName)) {
      return {
        status: MessageDebugStatus.MessageNotDelivered,
        description: 'Message not delivered, there may be an error',
        calldataDetails,
      };
    }

    const icaCallErr = await tryDebugIcaMsg(sender, recipient, body, originDomain, destProvider);
    if (icaCallErr) {
      return {
        status: MessageDebugStatus.IcaCallFailure,
        description: icaCallErr,
        calldataDetails,
      };
    }

    return {
      status: MessageDebugStatus.HandleCallFailure,
      description: errorReason,
      calldataDetails,
    };
  }
}

// TODO, this must check recursively for to handle aggregation/routing isms
async function checkMultisigIsmEmpty(
  recipientAddr: Address,
  messageBytes: string,
  destMailbox: Address,
  destProvider: Provider,
) {
  const mailbox = MailboxFactory.connect(destMailbox, destProvider);
  const ismAddress = await mailbox.recipientIsm(recipientAddr);
  if (!isValidAddress(ismAddress)) {
    logger.error(
      `Recipient ${recipientAddr} on mailbox ${destMailbox} does not have a valid ISM address: ${ismAddress}`,
    );
    throw new Error('Recipient ISM is not a valid address');
  }
  const ism = InterchainSecurityModuleFactory.connect(ismAddress, destProvider);
  const moduleType = await ism.moduleType();

  const ismDetails = { ismAddress, moduleType };
  if (moduleType !== IsmModuleTypes.LEGACY_MULTISIG && moduleType !== IsmModuleTypes.MULTISIG) {
    return { ismDetails };
  }

  const multisigIsm = MultisigIsmFactory.connect(ismAddress, destProvider);
  const [validators, threshold] = await multisigIsm.validatorsAndThreshold(messageBytes);

  if (!validators?.length) {
    return {
      status: MessageDebugStatus.MultisigIsmEmpty,
      description: 'Validator list is empty, has the ISM been configured correctly?',
      ismDetails,
    };
  } else if (threshold < 1) {
    return {
      status: MessageDebugStatus.MultisigIsmEmpty,
      description: 'Threshold is less than 1, has the ISM been configured correctly?',
      ismDetails,
    };
  }
  return { ismDetails };
}

async function tryCheckIgpGasFunded(
  messageId: string,
  originProvider: Provider,
  deliveryGasEstimate?: string,
  totalGasAmount?: string,
) {
  if (!deliveryGasEstimate) {
    logger.warn('No gas estimate provided, skipping IGP check');
    return null;
  }

  try {
    let gasAlreadyFunded = BigNumber.from(0);
    let gasDetails: MessageDebugResult['gasDetails'] = {
      deliveryGasEstimate,
    };
    if (totalGasAmount && BigNumber.from(totalGasAmount).gt(0)) {
      logger.debug(`Using totalGasAmount info from message: ${totalGasAmount}`);
      gasAlreadyFunded = BigNumber.from(totalGasAmount);
    } else {
      logger.debug('Querying for gas payments events for msg to any contract');
      const { contractToPayments, contractToTotalGas, numPayments, numIGPs } =
        await fetchGasPaymentEvents(originProvider, messageId);
      gasDetails = { deliveryGasEstimate, contractToPayments };
      logger.debug(`Found ${numPayments} payments to ${numIGPs} IGPs for msg ${messageId}`);
      if (numIGPs === 1) {
        gasAlreadyFunded = Object.values(contractToTotalGas)[0];
      } else if (numIGPs > 1) {
        logger.warn(`>1 IGPs paid for msg ${messageId}. Unsure which to use, skipping check.`);
        return { gasDetails };
      }
    }

    logger.debug('Amount of gas paid for to IGP:', gasAlreadyFunded.toString());
    logger.debug('Approximate amount of gas required:', deliveryGasEstimate);
    if (gasAlreadyFunded.lte(0)) {
      return {
        status: MessageDebugStatus.GasUnderfunded,
        description: 'Origin IGP has not received any gas payments',
        gasDetails,
      };
    } else if (gasAlreadyFunded.lte(deliveryGasEstimate)) {
      return {
        status: MessageDebugStatus.GasUnderfunded,
        description: `Origin IGP gas amount is ${gasAlreadyFunded.toString()} but requires ${deliveryGasEstimate}`,
        gasDetails,
      };
    } else {
      return { gasDetails };
    }
  } catch (error) {
    logger.warn('Error estimating delivery gas cost for message', error);
    return null;
  }
}

async function fetchGasPaymentEvents(provider: Provider, messageId: string) {
  const igpInterface = InterchainGasPaymasterFactory.createInterface();
  const paymentFragment = igpInterface.getEvent('GasPayment');
  const paymentTopics = igpInterface.encodeFilterTopics(paymentFragment.name, [messageId]);
  const paymentLogs = (await provider.getLogs({ topics: paymentTopics })) || [];
  const contractToPayments: AddressTo<GasPayment[]> = {};
  const contractToTotalGas: AddressTo<BigNumber> = {};
  let numPayments = 0;
  for (const log of paymentLogs) {
    const contractAddr = log.address;
    let newEvent: ethersUtils.LogDescription;
    try {
      newEvent = igpInterface.parseLog(log);
    } catch (error) {
      logger.warn('Error parsing gas payment log', error);
      continue;
    }
    const newPayment = {
      gasAmount: BigNumber.from(newEvent.args.gasAmount).toString(),
      paymentAmount: BigNumber.from(newEvent.args.payment).toString(),
    };
    contractToPayments[contractAddr] = [...(contractToPayments[contractAddr] || []), newPayment];
    contractToTotalGas[contractAddr] = (contractToTotalGas[contractAddr] || BigNumber.from(0)).add(
      newEvent.args.gasAmount,
    );
    numPayments += 1;
  }
  const numIGPs = Object.keys(contractToPayments).length;
  return { contractToPayments, contractToTotalGas, numPayments, numIGPs };
}

// async function tryCheckBytecodeHandle(provider: Provider, recipientAddress: string) {
//   try {
//     // scan bytecode for handle function selector
//     const bytecode = await provider.getCode(recipientAddress);
//     const msgRecipientInterface = MessageRecipientFactory.createInterface();
//     const handleFunction = msgRecipientInterface.functions[HANDLE_FUNCTION_SIG];
//     const handleSignature = msgRecipientInterface.getSighash(handleFunction);
//     return bytecode.includes(strip0x(handleSignature));
//   } catch (error) {
//     logger.error('Error checking bytecode for handle fn', error);
//     return true;
//   }
// }

async function tryDebugIcaMsg(
  sender: Address,
  recipient: Address,
  body: string,
  originDomainId: DomainId,
  destinationProvider: Provider,
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
  destinationProvider: Provider,
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

function noErrorFound(): MessageDebugResult {
  return {
    status: MessageDebugStatus.NoErrorsFound,
    description: 'Message may just need more time to be processed',
  };
}
