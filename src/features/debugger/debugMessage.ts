import {
  InterchainGasPaymaster__factory as InterchainGasPaymasterFactory,
  IInterchainSecurityModule__factory as InterchainSecurityModuleFactory,
  IMailbox__factory as MailboxFactory,
  IMessageRecipient__factory as MessageRecipientFactory,
  IMultisigIsm__factory as MultisigIsmFactory,
} from '@hyperlane-xyz/core';
import { IRegistry } from '@hyperlane-xyz/registry';
import { ChainMap, ChainMetadata, isProxy, proxyImplementation } from '@hyperlane-xyz/sdk';
import {
  addressToBytes32,
  errorToString,
  formatMessage,
  isValidAddress,
  isEVMLike,
  messageId as computeMessageId,
  ProtocolType,
  strip0x,
  trimToLength,
} from '@hyperlane-xyz/utils';
// Forked from debug script in monorepo but mostly rewritten
// https://github.com/hyperlane-xyz/hyperlane-monorepo/blob/main/typescript/infra/scripts/debug-message.ts
import { BigNumber, Contract, utils as ethersUtils, providers } from 'ethers';

import { debugIgnoredChains } from '../../consts/config';
import { MAILBOX_VERSION } from '../../consts/mailbox';
import { Message, MessageStub } from '../../types';
import { logger } from '../../utils/logger';
import { getMailboxAddress } from '../chains/utils';
import type { ExplorerMultiProvider as MultiProtocolProvider } from '../hyperlane/sdkRuntime';
import { computeIcaAddress, decodeIcaBody, IcaMessageType, isIcaMessage } from '../messages/ica';
import {
  GasPayment,
  IsmMetadataDetails,
  IsmModuleTypes,
  IsmRouteModule,
  MessageDebugResult,
  MessageDebugStatus,
} from './types';

type Provider = providers.Provider;

const HANDLE_FUNCTION_SIG = 'handle(uint32,bytes32,bytes)';
const IGP_PAYMENT_CHECK_DELAY = 60_000; // 60 seconds
const SIGNATURE_LENGTH = 65;
const MESSAGE_ID_MULTISIG_SIGNATURES_OFFSET = 68;
const MERKLE_ROOT_MULTISIG_SIGNATURES_OFFSET = 1096;
const AGGREGATION_RANGE_SIZE = 8;

const routingIsmInterface = new ethersUtils.Interface([
  'function route(bytes message) view returns (address)',
]);
const aggregationIsmInterface = new ethersUtils.Interface([
  'function modulesAndThreshold(bytes message) view returns (address[] modules, uint8 threshold)',
]);

export async function debugMessage(
  multiProvider: MultiProtocolProvider,
  registry: IRegistry,
  overrideChainMetadata: ChainMap<Partial<ChainMetadata>>,
  message: Message | MessageStub,
): Promise<MessageDebugResult> {
  const {
    msgId,
    nonce,
    sender,
    recipient,
    origin,
    originDomainId: originDomain,
    destinationDomainId: destDomain,
    body,
    isPiMsg,
  } = message;
  const totalGasAmount = 'totalGasAmount' in message ? message.totalGasAmount : undefined;

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
  const destName = multiProvider.tryGetChainName(destDomain);
  if (!destName) throw new Error(`Cannot debug message, unknown destination domain ${destDomain}`);
  const originProvider = multiProvider.getEthersV5Provider(originDomain) as Provider;
  const destProvider = multiProvider.getEthersV5Provider(destDomain) as Provider;
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
    destDomain,
    multiProvider,
  );
  if (deliveryResult.status && deliveryResult.description) return deliveryResult;
  else details.calldataDetails = deliveryResult.calldataDetails;

  const ismCheckResult = await checkMultisigIsmEmpty(
    recipient,
    messageBytes,
    destMailbox,
    destProvider,
    message.destination?.hash,
    msgId,
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
  destDomain: DomainId,
  multiProvider: MultiProtocolProvider,
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

    if (debugIgnoredChains.includes(destName)) {
      return {
        status: null,
        description: '',
        calldataDetails,
      };
    }

    const proxyImplementationContract = await tryGetProxyImplementationContract(
      destProvider,
      recipient,
    );
    const bytecodeHasHandle = await tryCheckBytecodeHandle(
      destProvider,
      proxyImplementationContract || recipient,
    );
    if (!bytecodeHasHandle) {
      logger.info('Bytecode does not have function matching handle sig');
      return {
        status: MessageDebugStatus.RecipientNotHandler,
        description: `Recipient contract should have handle function of signature: ${HANDLE_FUNCTION_SIG}. Error: ${errorReason}`,
        calldataDetails,
      };
    }

    const icaDebugResult = await tryDebugIcaMsg(
      sender,
      recipient,
      body,
      originDomain,
      destDomain,
      multiProvider,
      destProvider,
    );
    if (icaDebugResult) {
      return {
        status: MessageDebugStatus.IcaCallFailure,
        description: `ICA call ${icaDebugResult.failedCallIndex + 1} of ${icaDebugResult.totalCalls} cannot be executed. ${icaDebugResult.errorReason}`,
        calldataDetails,
        icaDetails: icaDebugResult,
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
  processTxHash?: string,
  expectedMessageId?: string,
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

  let moduleType: IsmModuleTypes | undefined = undefined;
  try {
    moduleType = Number(await ism.moduleType()) as IsmModuleTypes;
  } catch (error) {
    logger.error('Invalid ISM', error);
    return {
      status: MessageDebugStatus.InvalidIsmDefinition,
      description:
        'Invalid ISM. Please verify that the ISM has been configured correctly or exists.',
    };
  }
  const rawMetadata = await tryFetchProcessMetadata(
    destProvider,
    destMailbox,
    processTxHash,
    expectedMessageId,
  );
  const metadata = rawMetadata ? decodeIsmMetadata(rawMetadata, moduleType) : undefined;
  const route = await tryDescribeIsmRoute(
    ismAddress,
    moduleType,
    messageBytes,
    destProvider,
    metadata,
  );
  const ismDetails = { ismAddress, moduleType, metadata, route };

  if (routeHasEmptyMultisig(route)) {
    return {
      status: MessageDebugStatus.MultisigIsmEmpty,
      description: 'Validator list or threshold is empty, has the ISM been configured correctly?',
      ismDetails,
    };
  }

  return { ismDetails };
}

function routeHasEmptyMultisig(route?: IsmRouteModule): boolean {
  if (!route) return false;
  if (
    (route.moduleType === IsmModuleTypes.LEGACY_MULTISIG ||
      route.moduleType === IsmModuleTypes.MULTISIG) &&
    route.multisigResolved &&
    (!route.validators?.length || !route.threshold || route.threshold < 1)
  ) {
    return true;
  }
  return route.children?.some(routeHasEmptyMultisig) || false;
}

async function tryDescribeIsmRoute(
  ismAddress: Address,
  moduleType: IsmModuleTypes | undefined,
  messageBytes: string,
  provider: Provider,
  metadata?: IsmMetadataDetails,
  depth = 0,
): Promise<IsmRouteModule> {
  const node: IsmRouteModule = { address: ismAddress, moduleType, metadata };
  if (depth > 6) return node;

  try {
    if (moduleType === IsmModuleTypes.ROUTING) {
      const routedAddress = await new Contract(ismAddress, routingIsmInterface, provider).route(
        messageBytes,
      );
      const routedType = await tryGetModuleType(routedAddress, provider);
      node.children = [
        await tryDescribeIsmRoute(
          routedAddress,
          routedType,
          messageBytes,
          provider,
          metadata,
          depth + 1,
        ),
      ];
    } else if (moduleType === IsmModuleTypes.AGGREGATION) {
      const [modules, threshold] = await new Contract(
        ismAddress,
        aggregationIsmInterface,
        provider,
      ).modulesAndThreshold(messageBytes);
      node.threshold = Number(threshold);
      node.children = await Promise.all(
        modules.map(async (moduleAddress: Address, index: number) => {
          const childType = await tryGetModuleType(moduleAddress, provider);
          const childMetadata = metadata?.ranges?.[index]?.hasMetadata
            ? decodeIsmMetadata(
                sliceHex(metadata.raw, metadata.ranges[index].start, metadata.ranges[index].end),
                childType,
              )
            : undefined;
          return tryDescribeIsmRoute(
            moduleAddress,
            childType,
            messageBytes,
            provider,
            childMetadata,
            depth + 1,
          );
        }),
      );
    } else if (
      moduleType === IsmModuleTypes.LEGACY_MULTISIG ||
      moduleType === IsmModuleTypes.MULTISIG
    ) {
      const multisigIsm = MultisigIsmFactory.connect(ismAddress, provider);
      const [validators, threshold] = await multisigIsm.validatorsAndThreshold(messageBytes);
      node.validators = validators;
      node.threshold = Number(threshold);
      node.multisigResolved = true;
    }
  } catch (error) {
    logger.warn(`Error describing ISM route for ${ismAddress}`, error);
  }

  return node;
}

async function tryGetModuleType(ismAddress: Address, provider: Provider) {
  try {
    return Number(await InterchainSecurityModuleFactory.connect(ismAddress, provider).moduleType());
  } catch (error) {
    logger.warn(`Error reading ISM module type for ${ismAddress}`, error);
    return undefined;
  }
}

async function tryFetchProcessMetadata(
  provider: Provider,
  mailboxAddress: Address,
  processTxHash?: string,
  expectedMessageId?: string,
) {
  if (!processTxHash) return undefined;

  try {
    const tx = await provider.getTransaction(processTxHash);
    if (!tx?.data) return undefined;

    const mailboxInterface = MailboxFactory.createInterface();
    const mailboxLower = mailboxAddress.toLowerCase();
    const processCalls: Array<{ metadata: string; message: string }> = [];

    const tryParseProcessCall = (target: string | undefined, callData: string) => {
      if (target && target.toLowerCase() !== mailboxLower) return;
      try {
        const parsed = mailboxInterface.parseTransaction({ data: callData });
        if (parsed.name === 'process') {
          processCalls.push({
            metadata: parsed.args[0] as string,
            message: parsed.args[1] as string,
          });
        }
      } catch {
        // Not a mailbox process call.
      }
    };

    tryParseProcessCall(tx.to, tx.data);
    for (const processCall of tryDecodeProcessCallsFromMulticall(
      tx.data,
      mailboxInterface,
      mailboxAddress,
    )) {
      processCalls.push(processCall);
    }

    const matchingCall = expectedMessageId
      ? processCalls.find((processCall) => {
          try {
            return (
              computeMessageId(processCall.message).toLowerCase() ===
              expectedMessageId.toLowerCase()
            );
          } catch {
            return false;
          }
        })
      : processCalls[0];

    return matchingCall?.metadata;
  } catch (error) {
    logger.warn('Error fetching ISM metadata from process transaction', error);
    return undefined;
  }
}

function tryDecodeProcessCallsFromMulticall(
  txData: string,
  mailboxInterface: ethersUtils.Interface,
  mailboxAddress: Address,
): Array<{ metadata: string; message: string }> {
  const results: Array<{ metadata: string; message: string }> = [];
  const mailboxLower = mailboxAddress.toLowerCase();

  const tryParseProcessCall = (target: string, callData: string) => {
    if (target.toLowerCase() !== mailboxLower) return;
    try {
      const parsed = mailboxInterface.parseTransaction({ data: callData });
      if (parsed.name === 'process') {
        results.push({ metadata: parsed.args[0] as string, message: parsed.args[1] as string });
      }
    } catch {
      // Not a process call.
    }
  };

  try {
    const selector = txData.slice(0, 10);
    const payload = `0x${txData.slice(10)}`;

    if (selector === ethersUtils.id('aggregate3((address,bool,bytes)[])').slice(0, 10)) {
      const [calls] = ethersUtils.defaultAbiCoder.decode(
        ['tuple(address target, bool allowFailure, bytes callData)[]'],
        payload,
      );
      for (const call of calls as Array<{ target: string; callData: string }>) {
        tryParseProcessCall(call.target, call.callData);
      }
    } else if (
      selector === ethersUtils.id('aggregate3Value((address,bool,uint256,bytes)[])').slice(0, 10)
    ) {
      const [calls] = ethersUtils.defaultAbiCoder.decode(
        ['tuple(address target, bool allowFailure, uint256 value, bytes callData)[]'],
        payload,
      );
      for (const call of calls as Array<{ target: string; callData: string }>) {
        tryParseProcessCall(call.target, call.callData);
      }
    } else if (selector === ethersUtils.id('tryAggregate(bool,(address,bytes)[])').slice(0, 10)) {
      const [, calls] = ethersUtils.defaultAbiCoder.decode(
        ['bool', 'tuple(address target, bytes callData)[]'],
        payload,
      );
      for (const call of calls as Array<{ target: string; callData: string }>) {
        tryParseProcessCall(call.target, call.callData);
      }
    } else if (selector === ethersUtils.id('aggregate((address,bytes)[])').slice(0, 10)) {
      const [calls] = ethersUtils.defaultAbiCoder.decode(
        ['tuple(address target, bytes callData)[]'],
        payload,
      );
      for (const call of calls as Array<{ target: string; callData: string }>) {
        tryParseProcessCall(call.target, call.callData);
      }
    }
  } catch (error) {
    logger.debug('Failed to decode process multicall', error);
  }

  return results;
}

function decodeIsmMetadata(metadata: string, moduleType?: IsmModuleTypes): IsmMetadataDetails {
  const length = byteLength(metadata);
  const base: IsmMetadataDetails = { raw: metadata, length };

  if (moduleType === IsmModuleTypes.AGGREGATION) {
    const ranges = decodeAggregationRanges(metadata);
    if (ranges.length) return { ...base, format: 'aggregation', ranges };
  }

  if (length >= MERKLE_ROOT_MULTISIG_SIGNATURES_OFFSET) {
    const signatureBytes = length - MERKLE_ROOT_MULTISIG_SIGNATURES_OFFSET;
    if (signatureBytes >= 0 && signatureBytes % SIGNATURE_LENGTH === 0) {
      return {
        ...base,
        format: 'merkleRootMultisig',
        originMerkleTreeHook: sliceHex(metadata, 0, 32),
        messageIndex: readUint32(metadata, 32),
        signedMessageId: sliceHex(metadata, 36, 68),
        proof: Array.from({ length: 32 }, (_, i) => sliceHex(metadata, 68 + i * 32, 100 + i * 32)),
        signedIndex: readUint32(metadata, 1092),
        signatureCount: signatureBytes / SIGNATURE_LENGTH,
      };
    }
  }

  if (length >= MESSAGE_ID_MULTISIG_SIGNATURES_OFFSET) {
    const signatureBytes = length - MESSAGE_ID_MULTISIG_SIGNATURES_OFFSET;
    if (signatureBytes >= 0 && signatureBytes % SIGNATURE_LENGTH === 0) {
      return {
        ...base,
        format: 'messageIdMultisig',
        originMerkleTreeHook: sliceHex(metadata, 0, 32),
        root: sliceHex(metadata, 32, 64),
        index: readUint32(metadata, 64),
        signatureCount: signatureBytes / SIGNATURE_LENGTH,
      };
    }
  }

  if (moduleType !== IsmModuleTypes.AGGREGATION) {
    const ranges = decodeAggregationRanges(metadata);
    if (ranges.length) return { ...base, format: 'aggregation', ranges };
  }

  return { ...base, format: 'unknown' };
}

function decodeAggregationRanges(metadata: string) {
  const length = byteLength(metadata);
  const ranges: IsmMetadataDetails['ranges'] = [];
  for (
    let offset = 0;
    offset + AGGREGATION_RANGE_SIZE <= Math.min(length, 64);
    offset += AGGREGATION_RANGE_SIZE
  ) {
    const start = readUint32(metadata, offset);
    const end = readUint32(metadata, offset + 4);
    if (start === 0 && end === 0) {
      ranges.push({ start, end, hasMetadata: false });
      continue;
    }
    if (start < AGGREGATION_RANGE_SIZE || end <= start || end > length) break;
    ranges.push({ start, end, hasMetadata: true });
  }
  return ranges.length > 0 ? ranges : [];
}

function readUint32(hex: string, byteOffset: number) {
  return Number.parseInt(sliceHex(hex, byteOffset, byteOffset + 4), 16);
}

function sliceHex(hex: string, startByte: number, endByte: number) {
  return `0x${strip0x(hex).slice(startByte * 2, endByte * 2)}`;
}

function byteLength(hex: string) {
  return strip0x(hex).length / 2;
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

async function tryGetProxyImplementationContract(provider: Provider, recipientAddress: string) {
  try {
    const isProxyContract = await isProxy(provider, recipientAddress);
    if (!isProxyContract) return undefined;

    return await proxyImplementation(provider, recipientAddress);
  } catch (error) {
    logger.error('Error trying to check proxy contract', error);
    return undefined;
  }
}

async function tryCheckBytecodeHandle(provider: Provider, recipientAddress: string) {
  try {
    // scan bytecode for handle function selector
    const bytecode = await provider.getCode(recipientAddress);
    const msgRecipientInterface = MessageRecipientFactory.createInterface();
    const handleFunction = msgRecipientInterface.functions[HANDLE_FUNCTION_SIG];
    const handleSignature = msgRecipientInterface.getSighash(handleFunction);
    return bytecode.includes(strip0x(handleSignature));
  } catch (error) {
    logger.error('Error checking bytecode for handle fn', error);
    return true;
  }
}

interface IcaDebugResult {
  failedCallIndex: number;
  totalCalls: number;
  errorReason: string;
}

async function tryDebugIcaMsg(
  sender: Address,
  recipient: Address,
  body: string,
  originDomainId: DomainId,
  destinationDomainId: DomainId,
  multiProvider: MultiProtocolProvider,
  destinationProvider: Provider,
): Promise<IcaDebugResult | null> {
  if (!isEVMLike(multiProvider.tryGetProtocol(destinationDomainId) ?? ProtocolType.Unknown)) {
    return null;
  }
  if (!isIcaMessage({ sender, recipient })) return null;
  logger.debug('Message is for an ICA');

  const decodedBody = decodeIcaBody(body);
  if (!decodedBody) return null;

  // Only debug CALLS type messages - COMMITMENT and REVEAL have different flows
  if (decodedBody.messageType !== IcaMessageType.CALLS) {
    logger.debug('Skipping ICA debug for non-CALLS message type');
    return null;
  }

  const { calls, owner, ism, salt } = decodedBody;

  // Compute the actual ICA address for accurate gas estimation
  // sender is the origin ICA router, recipient is the destination ICA router
  const icaAddress = await computeIcaAddress(
    originDomainId,
    owner!, // owner is defined for CALLS type
    sender, // origin router (sender of ICA message)
    recipient, // destination router
    ism,
    salt,
    destinationProvider,
  );

  if (!icaAddress) {
    logger.debug('Could not compute ICA address, skipping call checks');
    return null;
  }

  logger.debug(`Computed ICA address: ${icaAddress}`);

  for (let i = 0; i < calls.length; i++) {
    const call = calls[i];
    logger.debug(`Checking ICA call ${i + 1} of ${calls.length}`);
    const errorReason = await tryCheckIcaCall(
      icaAddress,
      call.to,
      call.data,
      call.value,
      destinationProvider,
    );
    if (errorReason) {
      return {
        failedCallIndex: i,
        totalCalls: calls.length,
        errorReason,
      };
    }
  }

  return null;
}

export async function tryCheckIcaCall(
  icaAddress: string,
  destinationAddress: string,
  callBytes: string,
  callValue: string,
  destinationProvider: Provider,
) {
  try {
    await destinationProvider.estimateGas({
      to: destinationAddress,
      data: callBytes,
      from: icaAddress,
      value: BigNumber.from(callValue),
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
