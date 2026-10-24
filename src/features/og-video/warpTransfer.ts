import { formatAmountWithCommas } from '../../utils/amount';
import { logger } from '../../utils/logger';
import { getWarpRouteAmountParts } from '../../utils/warpRouteAmounts';
import { normalizeAddressToHex, type WarpRouteMap, type WarpToken } from '../../utils/yamlParsing';
import type { MessageOGData } from '../messages/queries/serverFetch';

interface WarpTransferDetails {
  token: WarpToken;
  amount: string;
}

// Sanitize token symbols for OG image rendering (Satori doesn't support all Unicode)
export function sanitizeSymbol(symbol: string): string {
  // Replace known problematic Unicode characters
  return symbol
    .replace(/₮/g, 'T') // Mongolian Tugrik sign used in USDT
    .replace(/[^\x20-\x7E]/g, ''); // Remove any other non-ASCII characters
}

/**
 * Parse warp route message body to extract recipient and amount.
 * Edge-compatible implementation matching @hyperlane-xyz/utils parseWarpRouteMessage.
 *
 * Wire amount = `localAmount * scale`; scale defaults to identity when unset,
 * so the wire amount is in the origin token's native-decimal space.
 */
function parseWarpMessageBody(body: string): { recipient: string; amount: bigint } | null {
  try {
    // Remove 0x prefix if present
    const hex = body.startsWith('0x') ? body.slice(2) : body;
    // Need at least 64 bytes (128 hex chars) for recipient (32) + amount (32)
    if (hex.length < 128) return null;

    // First 32 bytes (64 hex chars) = recipient (kept as full 32-byte hex)
    const recipient = '0x' + hex.slice(0, 64);

    // Next 32 bytes = amount (uint256)
    const amountHex = hex.slice(64, 128);
    const amount = BigInt('0x' + amountHex);

    return { recipient, amount };
  } catch {
    return null;
  }
}

// Format token amount from wei to human-readable string
function formatTokenAmount(amountWei: bigint, decimals: number): string {
  const divisor = BigInt(10 ** decimals);
  const integerPart = amountWei / divisor;
  const fractionalPart = amountWei % divisor;

  if (fractionalPart === BigInt(0)) {
    return integerPart.toString();
  }

  // Pad fractional part with leading zeros, limit to 6 decimal places
  const fractionalStr = fractionalPart.toString().padStart(decimals, '0');
  const trimmed = fractionalStr.slice(0, 6).replace(/0+$/, '');

  if (trimmed === '') {
    return integerPart.toString();
  }

  return `${integerPart}.${trimmed}`;
}
export function getWarpTransferDetails(
  messageData: MessageOGData,
  originChainName: string,
  warpRouteMap: WarpRouteMap,
): WarpTransferDetails | null {
  if (!messageData.body) return null;

  const originChainTokens = warpRouteMap.get(originChainName);
  if (!originChainTokens) return null;

  // Sender/recipient are bytes32 hex; warp route map keys are also normalized hex
  const normalizedSender = normalizeAddressToHex(messageData.sender);

  const originToken = originChainTokens.get(normalizedSender);
  if (!originToken) return null;

  const parsed = parseWarpMessageBody(messageData.body);
  if (!parsed) return null;

  try {
    const amountParts = getWarpRouteAmountParts(parsed.amount, {
      decimals: originToken.decimals,
      scale: originToken.scale,
    });
    const formattedAmount = formatTokenAmount(amountParts.amount, amountParts.decimals);

    return {
      token: originToken,
      amount: formatAmountWithCommas(formattedAmount),
    };
  } catch (error) {
    logger.warn('Failed to parse warp transfer details for OG image:', error);
    return null;
  }
}
