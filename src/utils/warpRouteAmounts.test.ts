import { getWarpRouteAmountParts } from './warpRouteAmounts';

describe('getWarpRouteAmountParts', () => {
  it('uses scale=1 (no division) when scale is not provided', () => {
    const messageAmount = 1_000_000n;
    const result = getWarpRouteAmountParts(messageAmount, { decimals: 6 });
    expect(result).toEqual({ amount: 1_000_000n, decimals: 6 });
  });

  it('uses explicit scale when provided', () => {
    const messageAmount = 10n ** 19n;
    const result = getWarpRouteAmountParts(messageAmount, { decimals: 18, scale: 10 });
    expect(result).toEqual({ amount: 10n ** 18n, decimals: 18 });
  });

  it('uses scale=1 when scale is invalid (non-integer)', () => {
    const messageAmount = 1_000_000n;
    const result = getWarpRouteAmountParts(messageAmount, { decimals: 6, scale: 1.5 });
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

describe('getWarpRouteAmountParts caller context scenarios', () => {
  it('Cosmos→EVM (origin 6, dest 18): caller passes origin decimals', () => {
    const messageAmount = 1_020_000n;
    const result = getWarpRouteAmountParts(messageAmount, { decimals: 6 });
    expect(result).toEqual({ amount: 1_020_000n, decimals: 6 });
  });

  it('EVM→Cosmos (origin 18, dest 6): caller passes origin decimals', () => {
    const messageAmount = 1_020_000_000_000_000_000n;
    const result = getWarpRouteAmountParts(messageAmount, { decimals: 18 });
    expect(result).toEqual({ amount: 1_020_000_000_000_000_000n, decimals: 18 });
  });

  it('non-Cosmos route (origin 6, dest 18): caller passes maxDecimals', () => {
    const messageAmount = 1_020_000_000_000_000_000n;
    const result = getWarpRouteAmountParts(messageAmount, { decimals: 18 });
    expect(result).toEqual({ amount: 1_020_000_000_000_000_000n, decimals: 18 });
  });

  it('explicit scale overrides decimals calculation', () => {
    const messageAmount = 10_200_000_000_000_000_000n;
    const result = getWarpRouteAmountParts(messageAmount, { decimals: 18, scale: 10 });
    expect(result).toEqual({ amount: 1_020_000_000_000_000_000n, decimals: 18 });
  });
});
