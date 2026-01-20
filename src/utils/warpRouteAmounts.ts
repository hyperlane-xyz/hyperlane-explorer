const DEFAULT_TOKEN_DECIMALS = 18;

export type WarpRouteAmountConfig = {
  decimals?: number;
  scale?: number | string;
};

export type WarpRouteAmountParts = {
  amount: bigint;
  decimals: number;
};

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
 *    - EVM/Sealevel routes: typically normalized to maxDecimals by caller
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
