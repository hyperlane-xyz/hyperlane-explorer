import { strip0x } from '@hyperlane-xyz/utils';

// Only allows letters and numbers
const alphanumericRgex = /[^a-zA-Z0-9]/gi;
export function sanitizeString(str: string) {
  if (!str || typeof str !== 'string') return '';
  return str.replaceAll(alphanumericRgex, '');
}

export function tryUtf8DecodeBytes(value: string, fatal = true) {
  if (!value) return undefined;
  try {
    const decoder = new TextDecoder('utf-8', { fatal });
    return decoder.decode(Buffer.from(strip0x(value), 'hex'));
  } catch {
    return undefined;
  }
}

/**
 * Check if input looks like a warp route ID (e.g., "USDC/ethereum-base", "ETH/ethereum-arbitrum")
 * Warp route IDs have format: SYMBOL/route-name (contains exactly one slash, no 0x prefix)
 */
export function isWarpRouteIdFormat(input: string): boolean {
  const trimmed = input.trim();
  if (!trimmed || trimmed.length <= 2) return false;
  if (trimmed.startsWith('0x')) return false;
  const slashCount = (trimmed.match(/\//g) || []).length;
  return slashCount === 1;
}

export function truncateString(str: string, startChars = 15, endChars = 15) {
  if (!str || str.length <= startChars + endChars + 3) return str;
  return `${str.slice(0, startChars)}...${str.slice(-endChars)}`;
}
