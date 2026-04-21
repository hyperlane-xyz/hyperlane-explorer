import type { ScaleInput } from '@hyperlane-xyz/sdk';

import { COSMOS_STANDARDS } from '../consts/tokenStandards';
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

export interface EffectiveDecimalsToken {
  decimals?: number;
  scale?: ScaleInput;
  standard?: string;
  // Wire decimals = max decimals across all tokens in a warp route.
  // Both fields supported for compatibility: wireDecimals (preferred) and maxDecimals (legacy).
  wireDecimals?: number;
  maxDecimals?: number;
}

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
 * 2. Routes without scale - amount is in origin decimals
 *    - Cosmos routes: origin token doesn't normalize, uses native decimals
 *    - EVM/Sealevel routes: typically normalized to wireDecimals by caller
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
