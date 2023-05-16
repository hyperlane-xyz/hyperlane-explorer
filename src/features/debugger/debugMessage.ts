// Forked from debug script in monorepo but mostly rewritten
// https://github.com/hyperlane-xyz/hyperlane-monorepo/blob/main/typescript/infra/scripts/debug-message.ts
import { BigNumber, utils as ethersUtils, providers } from 'ethers';

import {
  IInterchainSecurityModule__factory,
  IMailbox__factory,
  IMessageRecipient__factory,
  InterchainGasPaymaster__factory,
  LegacyMultisigIsm__factory,
} from '@hyperlane-xyz/core';
import type { ChainMap, MultiProvider } from '@hyperlane-xyz/sdk';
import { utils } from '@hyperlane-xyz/utils';

import { MAILBOX_VERSION } from '../../consts/environments';
import { Message } from '../../types';
import { isValidAddress, trimLeading0x } from '../../utils/addresses';
import { errorToString } from '../../utils/errors';
import { logger } from '../../utils/logger';
import { trimToLength } from '../../utils/string';
import type { ChainConfig } from '../chains/chainConfig';
import { getContractAddress } from '../chains/utils';
import { isIcaMessage, tryDecodeIcaBody, tryFetchIcaAddress } from '../messages/ica';

import { GasPayment, MessageDebugDetails, MessageDebugStatus } from './types';

type Provider = providers.Provider;

const HANDLE_FUNCTION_SIG = 'handle(uint32,bytes32,bytes)';

export async function debugMessage(
  multiProvider: MultiProvider,
  customChainConfigs: ChainMap<ChainConfig>,
  message: Message,
): Promise<MessageDebugDetails> {
  const {
    msgId,
    nonce,
    sender,
    recipient,
    originDomainId: originDomain,
    destinationDomainId: destDomain,
    body,
    totalGasAmount,
  } = message;
  logger.debug(`Debugging message id: ${msgId}`);

  const destName = multiProvider.tryGetChainName(destDomain)!;
  const originProvider = multiProvider.getProvider(originDomain);
  const destProvider = multiProvider.getProvider(destDomain);

  const recipInvalid = await isInvalidRecipient(destProvider, recipient);
  if (recipInvalid) return recipInvalid;

  const destMailbox = getContractAddress(customChainConfigs, destName, 'mailbox');
  const senderBytes = utils.addressToBytes32(sender);
  const deliveryResult = await debugMessageDelivery(
    originDomain,
    destMailbox,
    destProvider,
    sender,
    recipient,
    senderBytes,
    body,
  );
  if (deliveryResult.status && deliveryResult.details) return deliveryResult;
  const gasEstimate = deliveryResult.gasEstimate;

  const messageBytes = utils.formatMessage(
    MAILBOX_VERSION,
    nonce,
    originDomain,
    sender,
    destDomain,
    recipient,
    body,
  );
  const multisigIsmCheckResult = await checkMultisigIsmEmpty(
    recipient,
    messageBytes,
    destMailbox,
    destProvider,
  );
  if (multisigIsmCheckResult.status && multisigIsmCheckResult.details)
    return multisigIsmCheckResult;
  // TODO surface multisigIsmCheckResult.ismDetails up to UI

  const gasCheckResult = await tryCheckIgpGasFunded(
    msgId,
    originProvider,
    gasEstimate,
    totalGasAmount,
  );
  if (gasCheckResult?.status && gasCheckResult?.details) return gasCheckResult;

  logger.debug(`No errors found debugging message id: ${msgId}`);
  return { ...noErrorFound(), gasDetails: gasCheckResult?.gasDetails };
}

async function isInvalidRecipient(provider: Provider, recipient: Address) {
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
) {
  const recipientContract = IMessageRecipient__factory.connect(recipient, destProvider);
  try {
    // TODO add special case for Arbitrum:
    // TODO account for mailbox handling gas overhead
    // https://github.com/hyperlane-xyz/hyperlane-monorepo/pull/1949/files#diff-79ec1cf679507919c08a9a66e0407c16fff22aee98d79cf39a0c1baf086403ebR364
    const deliveryGasEst = await recipientContract.estimateGas.handle(
      originDomain,
      senderBytes,
      body,
      {
        from: destMailbox,
      },
    );
    logger.debug(
      `Calling recipient handle function from the inbox does not revert. Gas: ${deliveryGasEst.toString()}`,
    );
    return { gasEstimate: deliveryGasEst.toString() };
  } catch (err: any) {
    logger.info('Estimate gas call failed:', err);
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

// Must match https://github.com/hyperlane-xyz/hyperlane-monorepo/blob/main/solidity/contracts/interfaces/IInterchainSecurityModule.sol#L5
enum IsmModuleTypes {
  UNUSED,
  ROUTING,
  AGGREGATION,
  LEGACY_MULTISIG,
  MULTISIG,
}

async function checkMultisigIsmEmpty(
  recipientAddr: Address,
  messageBytes: string,
  destMailbox: Address,
  destProvider: Provider,
) {
  const mailbox = IMailbox__factory.connect(destMailbox, destProvider);
  const ismAddr = await mailbox.recipientIsm(recipientAddr);
  if (!isValidAddress(ismAddr)) {
    logger.error(
      `Recipient ${recipientAddr} on mailbox ${destMailbox} does not have a valid ISM address: ${ismAddr}`,
    );
    throw new Error('Recipient ISM is not a valid address');
  }
  const ism = IInterchainSecurityModule__factory.connect(ismAddr, destProvider);
  const moduleType = await ism.moduleType();

  const ismDetails = { ismAddr, moduleType };
  if (moduleType !== IsmModuleTypes.LEGACY_MULTISIG) {
    return { ismDetails };
  }

  const legacyMultisigIsm = LegacyMultisigIsm__factory.connect(ismAddr, destProvider);
  const [validators, threshold] = await legacyMultisigIsm.validatorsAndThreshold(messageBytes);

  if (!validators?.length) {
    return {
      status: MessageDebugStatus.MultisigIsmEmpty,
      details:
        'Validator list is empty, did you register the validators with the ValidatorAnnounce contract?',
      ismDetails,
    };
  } else if (threshold < 1) {
    return {
      status: MessageDebugStatus.MultisigIsmEmpty,
      details: 'Threshold is less than 1, did you initialize the ISM contract?',
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
    let gasDetails: MessageDebugDetails['gasDetails'] = {
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
        details: 'Origin IGP has not received any gas payments',
        gasDetails,
      };
    } else if (gasAlreadyFunded.lte(deliveryGasEstimate)) {
      return {
        status: MessageDebugStatus.GasUnderfunded,
        details: `Origin IGP gas amount is ${gasAlreadyFunded.toString()} but requires ${deliveryGasEstimate}`,
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
  const igpInterface = InterchainGasPaymaster__factory.createInterface();
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

async function tryCheckBytecodeHandle(provider: Provider, recipientAddress: string) {
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

function noErrorFound(): MessageDebugDetails {
  return {
    status: MessageDebugStatus.NoErrorsFound,
    details: 'Message may just need more time to be processed',
  };
}
