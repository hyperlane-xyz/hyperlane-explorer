import { getWarpRouteAmountParts } from './warpRouteAmounts';

describe('getWarpRouteAmountParts', () => {
  it('uses scale=1 (no division) when scale is not provided', () => {
    // TIA route: Stride (6 decimals) -> Forma, message has 1000000 (1 TIA in 6 decimals)
    const messageAmount = 1_000_000n;
    const result = getWarpRouteAmountParts(messageAmount, { decimals: 6 });
    expect(result).toEqual({ amount: 1_000_000n, decimals: 6 });
  });

  it('uses explicit scale when provided', () => {
    // VRA route: BSC has scale=10
    const messageAmount = 10n ** 19n;
    const result = getWarpRouteAmountParts(messageAmount, { decimals: 18, scale: 10 });
    expect(result).toEqual({ amount: 10n ** 18n, decimals: 18 });
  });

  it('uses scale=1 when scale is invalid', () => {
    const messageAmount = 1_000_000n;
    const result = getWarpRouteAmountParts(messageAmount, { decimals: 6, scale: 1.5 });
    // Invalid scale (non-integer), falls back to scale=1
    expect(result).toEqual({ amount: 1_000_000n, decimals: 6 });
  });

  it('parses string scale values', () => {
    const messageAmount = 1_000_000_000n;
    const result = getWarpRouteAmountParts(messageAmount, { decimals: 6, scale: '1000' });
    expect(result).toEqual({ amount: 1_000_000n, decimals: 6 });
  });

  it('defaults to 18 decimals when decimals not provided', () => {
    const messageAmount = 10n ** 18n;
    const result = getWarpRouteAmountParts(messageAmount, {});
    expect(result).toEqual({ amount: 10n ** 18n, decimals: 18 });
  });

  it('handles zero scale as invalid (falls back to 1)', () => {
    const messageAmount = 1_000_000n;
    const result = getWarpRouteAmountParts(messageAmount, { decimals: 6, scale: 0 });
    expect(result).toEqual({ amount: 1_000_000n, decimals: 6 });
  });

  it('handles negative scale as invalid (falls back to 1)', () => {
    const messageAmount = 1_000_000n;
    const result = getWarpRouteAmountParts(messageAmount, { decimals: 6, scale: -10 });
    expect(result).toEqual({ amount: 1_000_000n, decimals: 6 });
  });
});
