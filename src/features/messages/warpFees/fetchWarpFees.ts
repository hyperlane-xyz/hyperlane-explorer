// eslint-disable-next-line camelcase
import { IERC20__factory, TokenRouter__factory } from '@hyperlane-xyz/core';
import { MultiProtocolProvider } from '@hyperlane-xyz/sdk';
import { fromWei } from '@hyperlane-xyz/utils';
import { BigNumber } from 'ethers';
import { Message, WarpRouteDetails } from '../../../types';
import { formatAmountCompact } from '../../../utils/amount';
import { logger } from '../../../utils/logger';

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

/**
 * Parse warp route fees from the origin transaction receipt.
 *
 * Bridge fee = total ERC20 transferred to router - SentTransferRemote amount.
 * Both values are in the origin token's native decimals:
 * - ERC20 Transfer events use native decimals by definition
 * - SentTransferRemote emits wireDecimals, but for same-decimal routes they match.
 *   We normalize the sent amount back to native decimals before subtracting.
 *
 * Only works for EVM ERC20 token routes (not native token routes).
 * Does not work for smart contract wallet / multisig senders where tx.from != ERC20 sender.
 */
export async function fetchWarpFees(
  message: Message,
  warpRouteDetails: WarpRouteDetails,
  multiProvider: MultiProtocolProvider,
): Promise<WarpFeeBreakdown | null> {
  try {
    const chainMetadata = multiProvider.tryGetChainMetadata(message.originDomainId);
    if (!chainMetadata || chainMetadata.protocol !== 'ethereum') return null;

    const { decimals, symbol } = warpRouteDetails.originToken;
    if (decimals === undefined) {
      logger.warn('Token missing decimals, skipping fee parsing');
      return null;
    }

    const provider = multiProvider.getEthersV5Provider(message.originDomainId);
    const receipt = await provider.getTransactionReceipt(message.origin.hash);
    if (!receipt) return null;

    const routerAddress = warpRouteDetails.originToken.addressOrDenom;

    // SentTransferRemote amount is in wireDecimals (max decimals across route)
    const sentAmountWire = parseSentTransferRemoteAmount(receipt.logs, routerAddress);
    if (!sentAmountWire) return null;

    // For collateral routes the ERC20 token differs from the router;
    // for synthetic routes the router IS the ERC20 token.
    const tokenAddress =
      (warpRouteDetails.originToken as Record<string, unknown>).collateralAddressOrDenom as
        | string
        | undefined;

    // ERC20 Transfer amounts are in native token decimals
    const totalTransferred = parseTotalErc20TransferredToRouter(
      receipt.logs,
      routerAddress,
      message.origin.from,
      tokenAddress || routerAddress,
    );
    if (!totalTransferred || totalTransferred.isZero()) return null;

    // Normalize sentAmount from wireDecimals to native decimals
    const wireDecimals = warpRouteDetails.originToken.wireDecimals ?? decimals;
    const sentAmount = normalizeDecimals(sentAmountWire, wireDecimals, decimals);

    const feeRaw = totalTransferred.sub(sentAmount);
    if (feeRaw.isNegative()) {
      logger.warn('Negative warp fee detected, likely a parsing issue');
      return null;
    }
    if (feeRaw.isZero()) return null;

    return {
      bridgeFee: formatAmountCompact(fromWei(feeRaw.toString(), decimals)),
      tokenSymbol: symbol || 'tokens',
      totalSent: formatAmountCompact(fromWei(totalTransferred.toString(), decimals)),
    };
  } catch (err) {
    logger.error('Error fetching warp fees:', err);
    return null;
  }
}

/** Normalize a BigNumber from one decimal basis to another */
export function normalizeDecimals(value: BigNumber, fromDecimals: number, toDecimals: number): BigNumber {
  if (fromDecimals === toDecimals) return value;
  if (fromDecimals > toDecimals) {
    return value.div(BigNumber.from(10).pow(fromDecimals - toDecimals));
  }
  return value.mul(BigNumber.from(10).pow(toDecimals - fromDecimals));
}

export function parseSentTransferRemoteAmount(
  logs: Array<{ address: string; topics: string[]; data: string }>,
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

export function parseTotalErc20TransferredToRouter(
  logs: Array<{ address: string; topics: string[]; data: string }>,
  routerAddress: string,
  senderAddress: string,
  tokenAddress: string,
): BigNumber | null {
  const lowerRouter = routerAddress.toLowerCase();
  const lowerSender = senderAddress.toLowerCase();
  const lowerToken = tokenAddress.toLowerCase();

  let total = BigNumber.from(0);
  let found = false;

  for (const log of logs) {
    // Only consider Transfer events from the expected token contract
    if (log.address.toLowerCase() !== lowerToken) continue;
    try {
      const parsed = erc20Iface.parseLog(log);
      if (parsed.name !== 'Transfer') continue;

      const from = (parsed.args.from as string).toLowerCase();
      const to = (parsed.args.to as string).toLowerCase();

      // Sum all ERC20 transfers from the sender to the router
      if (from === lowerSender && to === lowerRouter) {
        total = total.add(parsed.args.value);
        found = true;
      }
    } catch {
      // Not an ERC20 event
    }
  }

  return found ? total : null;
}
