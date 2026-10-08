import {
  InterchainGasPaymaster__factory as InterchainGasPaymasterFactory,
  IERC20__factory as Erc20Factory,
} from '@hyperlane-xyz/core';
import { BigNumber, utils } from 'ethers';

import { GasPayment } from '../debugger/types';

type ReceiptLog = { address: string; topics: Array<string>; data: string };

export const IgpPaymentDenomKind = {
  Native: 'native',
  Token: 'token',
  Ambiguous: 'ambiguous',
} as const;

export type IgpPaymentDenom =
  | { kind: typeof IgpPaymentDenomKind.Native }
  | { kind: typeof IgpPaymentDenomKind.Token; address: Address }
  | { kind: typeof IgpPaymentDenomKind.Ambiguous };

// Whether the payments of a message could be read from its origin tx
export const IgpPaymentsStatus = {
  Disabled: 'disabled',
  Pending: 'pending',
  Ready: 'ready',
  Error: 'error',
} as const;

export type IgpPaymentsStatusValue = (typeof IgpPaymentsStatus)[keyof typeof IgpPaymentsStatus];

interface IgpPaymentsStatusInput {
  // The receipt is wanted and the tx hash is known
  isEnabled: boolean;
  // The provider or chain metadata needed to read the receipt failed to load, so it never will be
  hasInitFailed: boolean;
  isChainMetadataReady: boolean;
  isEvmOrigin: boolean;
  hasData: boolean;
  hasError: boolean;
}

export function getIgpPaymentsStatus({
  isEnabled,
  hasInitFailed,
  isChainMetadataReady,
  isEvmOrigin,
  hasData,
  hasError,
}: IgpPaymentsStatusInput): IgpPaymentsStatusValue {
  if (!isEnabled || hasInitFailed) return IgpPaymentsStatus.Disabled;
  // Whether the origin chain is EVM isn't known until the chain metadata is loaded
  if (!isChainMetadataReady) return IgpPaymentsStatus.Pending;
  if (!isEvmOrigin) return IgpPaymentsStatus.Disabled;
  if (hasData) return IgpPaymentsStatus.Ready;
  return hasError ? IgpPaymentsStatus.Error : IgpPaymentsStatus.Pending;
}

export interface IgpPayment extends GasPayment {
  denom: IgpPaymentDenom;
}

const igpIface = InterchainGasPaymasterFactory.createInterface();
const GAS_PAYMENT_TOPIC = igpIface.getEventTopic('GasPayment');
const TRANSFER_TOPIC = Erc20Factory.createInterface().getEventTopic('Transfer');
// topic0 + indexed `from` + indexed `to`. ERC721 Transfer has a 4th (tokenId) topic.
const ERC20_TRANSFER_TOPIC_COUNT = 3;

/**
 * Per-payment breakdown of the IGP `GasPayment` logs emitted for `msgId` in its origin tx.
 *
 * The event has no token field. An ERC20 payment is inferred from the token's
 * `Transfer(_, igp, payment)` that `InterchainGasPaymaster._payForGas` emits
 * (`safeTransferFrom` followed by `GasPayment`) right before the `GasPayment` log.
 * Only logs after the previous `GasPayment` log (of any message) are considered, so
 * several messages in one tx can't claim each other's transfers.
 *
 * No matching transfer means a native payment. Matching transfers from different
 * token contracts can't be told apart, so those are reported as ambiguous.
 */
export function parseIgpPayments(logs: Array<ReceiptLog>, msgId: string): IgpPayment[] {
  const normalizedMsgId = msgId.toLowerCase();
  const payments: IgpPayment[] = [];
  let windowStart = 0;

  for (let i = 0; i < logs.length; i++) {
    const log = logs[i];
    if (!hasTopic0(log, GAS_PAYMENT_TOPIC)) continue;

    const windowLogs = logs.slice(windowStart, i);
    windowStart = i + 1;
    if (log.topics[1]?.toLowerCase() !== normalizedMsgId) continue;

    const { gasAmount, payment } = igpIface.decodeEventLog('GasPayment', log.data, log.topics);
    payments.push({
      gasAmount: BigNumber.from(gasAmount).toString(),
      paymentAmount: BigNumber.from(payment).toString(),
      denom: getPaymentDenom(windowLogs, log.address, BigNumber.from(payment)),
    });
  }

  return payments;
}

function getPaymentDenom(
  windowLogs: Array<ReceiptLog>,
  igpAddress: Address,
  payment: BigNumber,
): IgpPaymentDenom {
  const paddedIgp = utils.hexZeroPad(igpAddress, 32).toLowerCase();
  const tokens = windowLogs
    .filter(
      (log) =>
        hasTopic0(log, TRANSFER_TOPIC) &&
        log.topics.length === ERC20_TRANSFER_TOPIC_COUNT &&
        log.topics[2].toLowerCase() === paddedIgp &&
        utils.isHexString(log.data, 32) &&
        BigNumber.from(log.data).eq(payment),
    )
    .map((log) => log.address);

  if (!tokens.length) return { kind: IgpPaymentDenomKind.Native };
  const isSingleToken = tokens.every((t) => t.toLowerCase() === tokens[0].toLowerCase());
  return isSingleToken
    ? { kind: IgpPaymentDenomKind.Token, address: tokens[0] }
    : { kind: IgpPaymentDenomKind.Ambiguous };
}

function hasTopic0(log: ReceiptLog, topic0: string) {
  return log.topics[0]?.toLowerCase() === topic0;
}
