import type { ScaleInput } from '@hyperlane-xyz/sdk';

import { logger } from './logger';

const DEFAULT_TOKEN_DECIMALS = 18;

export type WarpRouteAmountConfig = {
  decimals?: number;
  scale?: ScaleInput;
};

export type WarpRouteAmountParts = {
  amount: bigint;
  decimals: number;
};

type ParsedScale = { numerator: bigint; denominator: bigint };

function toIntegerBigInt(value: number | bigint): bigint | null {
  if (typeof value === 'bigint') return value;
  if (!Number.isFinite(value) || !Number.isInteger(value)) return null;
  if (!Number.isSafeInteger(value)) return null;
  return BigInt(value);
}

function parseScale(scale: WarpRouteAmountConfig['scale']): ParsedScale | null {
  if (scale === undefined || scale === null) return null;
  if (typeof scale === 'string') {
    try {
      const parsed = BigInt(scale);
      return parsed > 0n ? { numerator: parsed, denominator: 1n } : null;
    } catch {
      return null;
    }
  }
  if (typeof scale === 'number') {
    if (!Number.isFinite(scale) || scale <= 0 || !Number.isInteger(scale)) return null;
    if (!Number.isSafeInteger(scale)) return null;
    return { numerator: BigInt(scale), denominator: 1n };
  }
  const numerator = toIntegerBigInt(scale.numerator);
  const denominator = toIntegerBigInt(scale.denominator);
  if (numerator === null || denominator === null) return null;
  if (numerator <= 0n || denominator <= 0n) return null;
  return { numerator, denominator };
}

function localAmountFromScale(messageAmount: bigint, scale: ParsedScale): bigint {
  // bigint division truncates toward zero (floor for positive token amounts)
  return (messageAmount * scale.denominator) / scale.numerator;
}

/**
 * Extract amount parts from a warp route message.
 *
 * When `scale` is explicitly defined in the token config, divide the message
 * amount by that scale (i.e. multiply by denominator/numerator).
 * Otherwise, assume the message amount is already in
 * the origin token's native decimal format (scale = 1).
 *
 * This handles two patterns:
 * 1. Routes with explicit scale (e.g., VRA: BSC scale=10, ETH scale=1)
 * 2. Routes without scale - amount is in origin decimals (on-chain default
 *    scale is identity for both EVM `TokenRouter` and SVM `HyperlaneToken`)
 */
export function getWarpRouteAmountParts(
  messageAmount: bigint,
  { decimals, scale }: WarpRouteAmountConfig,
): WarpRouteAmountParts {
  const tokenDecimals = decimals ?? DEFAULT_TOKEN_DECIMALS;
  const parsedScale = parseScale(scale);
  if (scale != null && !parsedScale) {
    logger.warn('Invalid warp route scale; falling back to 1:1', { scale });
  }
  const scaleValue = parsedScale ?? { numerator: 1n, denominator: 1n };
  return {
    amount: localAmountFromScale(messageAmount, scaleValue),
    decimals: tokenDecimals,
  };
}
