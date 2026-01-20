import { COSMOS_STANDARDS } from '../consts/tokenStandards';

const DEFAULT_TOKEN_DECIMALS = 18;

export type WarpRouteAmountConfig = {
  decimals?: number;
  scale?: number | string;
};

export type WarpRouteAmountParts = {
  amount: bigint;
  decimals: number;
};

export interface EffectiveDecimalsToken {
  decimals?: number;
  scale?: number;
  standard?: string;
  // Wire decimals = max decimals across all tokens in a warp route.
  // Both fields supported for compatibility: wireDecimals (preferred) and maxDecimals (legacy).
  wireDecimals?: number;
  maxDecimals?: number;
}

/**
 * Determine the effective decimals for decoding a warp route message amount.
 *
 * The message body amount encoding depends on the token standard:
 * 1. If scale is explicitly set, the router multiplied localAmount by scale,
 *    so we use origin token's native decimals
 * 2. Cosmos standards don't normalize amounts to max decimals,
 *    so the message amount is in origin token's native decimals
 * 3. EVM/Sealevel standards normalize to wireDecimals (max across all tokens in route)
 */
export function getEffectiveDecimals(
  originToken: EffectiveDecimalsToken,
  destinationToken?: EffectiveDecimalsToken,
): number {
  // If scale is explicitly set, use origin decimals
  if (originToken.scale !== undefined) {
    return originToken.decimals ?? DEFAULT_TOKEN_DECIMALS;
  }

  // Check if either token uses a Cosmos standard (no normalization)
  const isCosmosRoute =
    COSMOS_STANDARDS.has(originToken.standard || '') ||
    COSMOS_STANDARDS.has(destinationToken?.standard || '');

  if (isCosmosRoute) {
    return originToken.decimals ?? DEFAULT_TOKEN_DECIMALS;
  }

  // EVM/Sealevel: normalized to max decimals in route (wireDecimals or maxDecimals)
  return (
    originToken.wireDecimals ??
    originToken.maxDecimals ??
    originToken.decimals ??
    DEFAULT_TOKEN_DECIMALS
  );
}

function parseScale(scale: WarpRouteAmountConfig['scale']): bigint | null {
  if (scale === undefined || scale === null) return null;
  if (typeof scale === 'string') {
    try {
      const parsed = BigInt(scale);
      return parsed > 0n ? parsed : null;
    } catch {
      return null;
    }
  }
  if (!Number.isFinite(scale) || scale <= 0 || !Number.isInteger(scale)) return null;
  if (!Number.isSafeInteger(scale)) return null;
  return BigInt(scale);
}

/**
 * Extract amount parts from a warp route message.
 *
 * When `scale` is explicitly defined in the token config, divide the message
 * amount by that scale. Otherwise, assume the message amount is already in
 * the origin token's native decimal format (scale = 1).
 *
 * This handles two patterns:
 * 1. Routes with explicit scale (e.g., VRA: BSC scale=10, ETH scale=1)
 * 2. Routes without scale - amount is in origin decimals
 *    - Cosmos routes: origin token doesn't normalize, uses native decimals
 *    - EVM/Sealevel routes: typically normalized to wireDecimals by caller
 */
export function getWarpRouteAmountParts(
  messageAmount: bigint,
  { decimals, scale }: WarpRouteAmountConfig,
): WarpRouteAmountParts {
  const tokenDecimals = decimals ?? DEFAULT_TOKEN_DECIMALS;
  const scaleValue = parseScale(scale) ?? 1n;
  return {
    amount: messageAmount / scaleValue,
    decimals: tokenDecimals,
  };
}
