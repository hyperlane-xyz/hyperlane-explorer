import {
  IERC20__factory, // eslint-disable-line camelcase
  InterchainGasPaymaster__factory, // eslint-disable-line camelcase
  Mailbox__factory, // eslint-disable-line camelcase
  TokenRouter__factory, // eslint-disable-line camelcase
} from '@hyperlane-xyz/core';
import { MultiProtocolProvider, PROTOCOL_TO_HYP_NATIVE_STANDARD } from '@hyperlane-xyz/sdk';
import { ProtocolType, fromWei, isEVMLike } from '@hyperlane-xyz/utils';
import { BigNumber } from 'ethers';

import { Message, MessageStub, WarpRouteDetails } from '../../../types';
import { logger } from '../../../utils/logger';
import { getWarpRouteAmountParts } from '../../../utils/warpRouteAmounts';

export interface WarpFeeBreakdown {
  bridgeFee: string;
  tokenSymbol: string;
  totalSent: string;
}

// Hoist interface objects to module scope to avoid re-creation per call
// eslint-disable-next-line camelcase
const routerIface = TokenRouter__factory.createInterface();
// eslint-disable-next-line camelcase
const erc20Iface = IERC20__factory.createInterface();
// eslint-disable-next-line camelcase
const mailboxIface = Mailbox__factory.createInterface();
// eslint-disable-next-line camelcase
const igpIface = InterchainGasPaymaster__factory.createInterface();

type RawLog = { address: string; topics: Array<string>; data: string };

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
// All HypNative standards across protocols, from the SDK (matches Token.isHypNative()).
const HYP_NATIVE_STANDARDS = new Set<string>(Object.values(PROTOCOL_TO_HYP_NATIVE_STANDARD));

/**
 * Parse warp route fees from the origin transaction receipt.
 *
 * Two paths:
 *   - **ERC20 routes** (collateral / synthetic): fee = tokens pulled from user
 *     − `SentTransferRemote` amount, reversed through the token's scale.
 *   - **Native routes** (`HypNative`): fee = (`tx.value` − `IGP.GasPayment.payment`)
 *     − `SentTransferRemote` amount. IGP is always excluded so it doesn't leak
 *     into "warp fee". Skipped for multi-send native txs since `tx.value`
 *     can't be split per message. Any `ProtocolFee` hook charge is included
 *     in the displayed fee (it's a bridge fee, not user gas).
 *
 * Log scanning for ERC20 pulls is scoped to the slice bounded by this
 * message's `Mailbox.DispatchId`, so multi-send ERC20 txs are attributed
 * correctly. IGP `GasPayment` is correlated by `messageId` directly.
 *
 * Supports EVM-like chains (Ethereum + Tron). Non-EVM chains, txs without a
 * matching `DispatchId`, and zero-fee routes return `null`.
 *
 * Throws on transient provider errors so React Query retries; returns `null`
 * for structural reasons that won't resolve on retry.
 */
export async function fetchWarpFees(
  message: Message | MessageStub,
  warpRouteDetails: WarpRouteDetails,
  multiProvider: MultiProtocolProvider,
): Promise<WarpFeeBreakdown | null> {
  const chainMetadata = multiProvider.tryGetChainMetadata(message.originDomainId);
  if (!chainMetadata || !isEVMLike(chainMetadata.protocol)) return null;

  const { decimals, symbol } = warpRouteDetails.originToken;
  if (decimals === undefined) {
    logger.warn('Token missing decimals, skipping fee parsing');
    return null;
  }

  const provider =
    chainMetadata.protocol === ProtocolType.Tron
      ? multiProvider.getTronProvider(message.originDomainId)
      : multiProvider.getEthersV5Provider(message.originDomainId);

  const receipt = await provider.getTransactionReceipt(message.origin.hash);
  // Receipt not yet indexed — throw so React Query retries instead of caching null forever.
  if (!receipt) throw new Error(`No receipt for tx ${message.origin.hash}`);

  const routerAddress = warpRouteDetails.originToken.addressOrDenom;
  const messageLogs = sliceLogsForMessage(receipt.logs, message.msgId);
  if (!messageLogs) return null;

  const sentAmountWire = parseSentTransferRemoteAmount(messageLogs, routerAddress);
  if (!sentAmountWire) return null;

  const sentAmount = sentAmountToLocal(sentAmountWire, warpRouteDetails.originToken);

  const isNative = HYP_NATIVE_STANDARDS.has(warpRouteDetails.originToken.standard);
  const totalTransferred = isNative
    ? await parseTotalNativePulledFromUser(provider, receipt.logs, message)
    : parseTotalTokenPulledFromUser(
        messageLogs,
        routerAddress,
        // For collateral routes the ERC20 token differs from the router;
        // for synthetic routes the router IS the ERC20 token.
        warpRouteDetails.originToken.collateralAddressOrDenom ?? routerAddress,
        message.origin.from,
      );
  if (!totalTransferred || totalTransferred.isZero()) return null;

  const feeRaw = totalTransferred.sub(sentAmount);
  if (feeRaw.isNegative()) {
    // Invariant violation: user can't bridge more than they paid. Log loudly
    // so regressions in the parsing flow are easy to spot.
    logger.error('Negative warp fee detected, likely a parsing issue');
    return null;
  }
  if (feeRaw.isZero()) return null;

  return {
    // Raw fromWei output — no rounding. Fees are often below 6 decimals
    // (e.g. 0.0000015 USDT), so `formatAmountWithCommas`' 6-digit cap would
    // misrepresent the value users are trying to verify against the tx logs.
    bridgeFee: fromWei(feeRaw.toString(), decimals),
    tokenSymbol: symbol ?? 'tokens',
    totalSent: fromWei(totalTransferred.toString(), decimals),
  };
}

/**
 * Returns the log slice corresponding to a specific Hyperlane message.
 *
 * Finds the `DispatchId(messageId)` log matching `msgId`, then returns all
 * logs between the previous `DispatchId` (or the start of the tx) and this
 * one, inclusive. This is the set of side-effects emitted while processing
 * this specific message.
 */
export function sliceLogsForMessage(logs: Array<RawLog>, msgId: string): RawLog[] | null {
  const normalizedMsgId = msgId.toLowerCase();

  let targetIdx = -1;
  let prevDispatchIdx = -1;
  for (let i = 0; i < logs.length; i++) {
    const messageId = parseDispatchIdLog(logs[i]);
    if (!messageId) continue;
    if (messageId.toLowerCase() === normalizedMsgId) {
      targetIdx = i;
      break;
    }
    prevDispatchIdx = i;
  }

  if (targetIdx === -1) return null;
  return logs.slice(prevDispatchIdx + 1, targetIdx + 1);
}

function parseDispatchIdLog(log: RawLog): string | null {
  try {
    const parsed = mailboxIface.parseLog(log);
    if (parsed.name !== 'DispatchId') return null;
    return parsed.args.messageId as string;
  } catch {
    return null;
  }
}

/** Normalize a BigNumber from one decimal basis to another */
export function normalizeDecimals(
  value: BigNumber,
  fromDecimals: number,
  toDecimals: number,
): BigNumber {
  if (fromDecimals === toDecimals) return value;
  if (fromDecimals > toDecimals) {
    return value.div(BigNumber.from(10).pow(fromDecimals - toDecimals));
  }
  return value.mul(BigNumber.from(10).pow(toDecimals - fromDecimals));
}

/**
 * Reverse the origin router's `_outboundAmount` scaling back to the local
 * (native-decimals) amount.
 *
 * If the token has an explicit `scale`, use `getWarpRouteAmountParts` — it
 * mirrors the Solidity `mulDiv(scaleNumerator, scaleDenominator)`. Otherwise
 * assume the wire amount is in `wireDecimals` (the legacy max-decimals route
 * normalization) and rescale to native.
 */
function sentAmountToLocal(
  sentAmountWire: BigNumber,
  originToken: WarpRouteDetails['originToken'],
): BigNumber {
  if (originToken.scale !== undefined) {
    const { amount } = getWarpRouteAmountParts(BigInt(sentAmountWire.toString()), {
      decimals: originToken.decimals,
      scale: originToken.scale,
    });
    return BigNumber.from(amount.toString());
  }
  const nativeDecimals = originToken.decimals ?? 18;
  const wireDecimals = originToken.wireDecimals ?? nativeDecimals;
  return normalizeDecimals(sentAmountWire, wireDecimals, nativeDecimals);
}

export function parseSentTransferRemoteAmount(
  logs: Array<RawLog>,
  routerAddress: string,
): BigNumber | null {
  const lowerRouter = routerAddress.toLowerCase();

  for (const log of logs) {
    if (log.address.toLowerCase() !== lowerRouter) continue;
    try {
      const parsed = routerIface.parseLog(log);
      if (parsed.name === 'SentTransferRemote') {
        return BigNumber.from(parsed.args.amountOrId);
      }
    } catch {
      // Not a TokenRouter event
    }
  }
  return null;
}

/**
 * Sum the total amount pulled from the user for this send.
 *
 * Two pull patterns are charged by `TokenRouter._transferFromSender`:
 *   - Collateral routes: `safeTransferFrom(user, router, charge)` —
 *     emits `Transfer(user, router, charge)`.
 *   - Synthetic routes (HypERC20): `_burn(user, charge)` —
 *     emits `Transfer(user, 0x0, charge)`.
 *
 * Filters:
 *   - `from == senderAddress`: excludes mints (0x0 → …) and intra-router
 *     transfers (router → vault → …) that would otherwise inflate the total.
 *     Essential for lockbox / xERC20-VS / yield-vault routes where the tx
 *     contains mints of wrapper tokens to the router.
 *   - `to == router || to == 0x0`: accepts both pull patterns in one pass;
 *     the fee-recipient leg (`router → feeRecipient`) is excluded by
 *     the `from == user` gate.
 *
 * Limitation: smart-contract wallets / paymasters where `tx.from` isn't the
 * ERC20 sender will return `null` here. Correctness wins over coverage.
 */
export function parseTotalTokenPulledFromUser(
  logs: Array<RawLog>,
  routerAddress: string,
  tokenAddress: string,
  senderAddress: string,
): BigNumber | null {
  const lowerRouter = routerAddress.toLowerCase();
  const lowerToken = tokenAddress.toLowerCase();
  const lowerSender = senderAddress.toLowerCase();

  let total = BigNumber.from(0);
  let found = false;

  for (const log of logs) {
    if (log.address.toLowerCase() !== lowerToken) continue;
    try {
      const parsed = erc20Iface.parseLog(log);
      if (parsed.name !== 'Transfer') continue;
      const from = (parsed.args.from as string).toLowerCase();
      const to = (parsed.args.to as string).toLowerCase();
      if (from !== lowerSender) continue;
      const isCollateralPull = to === lowerRouter;
      const isBurn = to === ZERO_ADDRESS;
      if (!isCollateralPull && !isBurn) continue;
      total = total.add(parsed.args.value);
      found = true;
    } catch {
      // Not an ERC20 event
    }
  }

  return found ? total : null;
}

/**
 * For native-token routes, reconstruct the user's payment to the warp route
 * from `tx.value`, excluding IGP gas payment so it doesn't leak into fees.
 *
 * Native routes don't emit an ERC20 `Transfer` for the user's contribution —
 * it rides on `msg.value`. Returns `tx.value − igpPayment`; the caller then
 * subtracts `sentAmount` to get the fee. Negative / zero results are caught
 * by the caller's `feeRaw.isNegative()` / `feeRaw.isZero()` guards.
 *
 * Returns `null` if the tx contains multiple `SentTransferRemote` events
 * (multi-send native — `tx.value` can't be split across messages).
 */
async function parseTotalNativePulledFromUser(
  provider: { getTransaction(hash: string): Promise<{ value: BigNumber } | null> },
  allLogs: Array<RawLog>,
  message: Message | MessageStub,
): Promise<BigNumber | null> {
  if (countSentTransferRemotes(allLogs) !== 1) return null;

  const tx = await provider.getTransaction(message.origin.hash);
  if (!tx) throw new Error(`No tx for hash ${message.origin.hash}`);

  const igpPayment = parseIgpPaymentForMessage(allLogs, message.msgId) ?? BigNumber.from(0);
  return tx.value.sub(igpPayment);
}

function countSentTransferRemotes(logs: Array<RawLog>): number {
  let count = 0;
  for (const log of logs) {
    try {
      if (routerIface.parseLog(log).name === 'SentTransferRemote') count++;
    } catch {
      // not a TokenRouter event
    }
  }
  return count;
}

/**
 * Sum all IGP `GasPayment(bytes32 indexed messageId, ...)` events for this
 * message. A single message can have multiple payments (e.g. quoted then
 * topped up via `payForGas`), so all matching events must be summed.
 */
export function parseIgpPaymentForMessage(logs: Array<RawLog>, msgId: string): BigNumber | null {
  const normalizedMsgId = msgId.toLowerCase();
  let total = BigNumber.from(0);
  let found = false;
  for (const log of logs) {
    try {
      const parsed = igpIface.parseLog(log);
      if (parsed.name !== 'GasPayment') continue;
      if ((parsed.args.messageId as string).toLowerCase() !== normalizedMsgId) continue;
      total = total.add(parsed.args.payment);
      found = true;
    } catch {
      // Not an IGP event
    }
  }
  return found ? total : null;
}
