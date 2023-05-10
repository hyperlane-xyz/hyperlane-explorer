// Forked from debug script in monorepo but mostly rewritten
// https://github.com/hyperlane-xyz/hyperlane-monorepo/blob/main/typescript/infra/scripts/debug-message.ts
import { BigNumber, providers } from 'ethers';

import {
  type IInterchainGasPaymaster,
  IMessageRecipient__factory,
  InterchainGasPaymaster__factory,
} from '@hyperlane-xyz/core';
import type { ChainMap, MultiProvider } from '@hyperlane-xyz/sdk';
import { utils } from '@hyperlane-xyz/utils';

import { Message } from '../../types';
import { trimLeading0x } from '../../utils/addresses';
import { errorToString } from '../../utils/errors';
import { logger } from '../../utils/logger';
import { trimToLength } from '../../utils/string';
import type { ChainConfig } from '../chains/chainConfig';
import { getContractAddress, tryGetContractAddress } from '../chains/utils';
import { isIcaMessage, tryDecodeIcaBody, tryFetchIcaAddress } from '../messages/ica';

import { MessageDebugDetails, MessageDebugStatus } from './types';

type Provider = providers.Provider;

const HANDLE_FUNCTION_SIG = 'handle(uint32,bytes32,bytes)';

export async function debugExplorerMessage(
  multiProvider: MultiProvider,
  customChainConfigs: ChainMap<ChainConfig>,
  message: Message,
): Promise<MessageDebugDetails> {
  const {
    msgId,
    sender,
    recipient,
    originDomainId: originDomain,
    destinationDomainId: destDomain,
    body,
    totalGasAmount,
  } = message;
  logger.debug(`Debugging message id: ${msgId}`);

  const originName = multiProvider.getChainName(originDomain);
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

  const igpAddress = tryGetContractAddress(
    customChainConfigs,
    originName,
    'interchainGasPaymaster',
  );
  const insufficientGas = await isIgpUnderfunded(
    msgId,
    originProvider,
    igpAddress,
    gasEstimate,
    totalGasAmount,
  );
  if (insufficientGas) return insufficientGas;

  return noErrorFound();
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

async function isIgpUnderfunded(
  msgId: string,
  originProvider: Provider,
  igpAddress?: Address,
  deliveryGasEst?: string,
  totalGasAmount?: string,
) {
  if (!igpAddress) {
    logger.debug('No IGP address provided, skipping gas funding check');
    return false;
  }
  const igpContract = InterchainGasPaymaster__factory.connect(igpAddress, originProvider);
  const { isFunded, igpDetails } = await tryCheckIgpGasFunded(
    igpContract,
    msgId,
    deliveryGasEst,
    totalGasAmount,
  );
  if (!isFunded) {
    return {
      status: MessageDebugStatus.GasUnderfunded,
      details: igpDetails,
    };
  }
  return false;
}

async function tryCheckIgpGasFunded(
  igp: IInterchainGasPaymaster,
  messageId: string,
  deliveryGasEst?: string,
  totalGasAmount?: string,
) {
  try {
    if (!deliveryGasEst) throw new Error('No gas estimate provided');

    let gasAlreadyFunded = BigNumber.from(0);
    if (totalGasAmount) {
      const filter = igp.filters.GasPayment(messageId, null, null);
      const matchedEvents = (await igp.queryFilter(filter)) || [];
      logger.debug(`Found ${matchedEvents.length} payments to IGP for msg ${messageId}`);
      logger.debug(matchedEvents);
      for (const payment of matchedEvents) {
        gasAlreadyFunded = gasAlreadyFunded.add(payment.args.gasAmount);
      }
    } else {
      logger.debug(`Using totalGasAmount info from message: ${totalGasAmount}`);
      gasAlreadyFunded = BigNumber.from(totalGasAmount);
    }

    logger.debug('Amount of gas paid for to IGP:', gasAlreadyFunded.toString());
    logger.debug('Approximate amount of gas required:', deliveryGasEst);
    if (gasAlreadyFunded.lte(0)) {
      return { isFunded: false, igpDetails: 'Origin IGP has not received any gas payments' };
    } else if (gasAlreadyFunded.lte(deliveryGasEst)) {
      return {
        isFunded: false,
        igpDetails: `Origin IGP gas amount is ${gasAlreadyFunded.toString()} but requires ${deliveryGasEst}`,
      };
    } else {
      return { isFunded: true, igpDetails: '' };
    }
  } catch (error) {
    logger.warn('Error estimating delivery gas cost for message', error);
    return { isFunded: true, igpDetails: '' };
  }
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
