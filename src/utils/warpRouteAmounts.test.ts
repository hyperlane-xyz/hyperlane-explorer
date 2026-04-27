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

  it('falls back to scale=1 for non-integer scale', () => {
    const messageAmount = 1_000_000n;
    expect(getWarpRouteAmountParts(messageAmount, { decimals: 6, scale: 1.5 })).toEqual({
      amount: 1_000_000n,
      decimals: 6,
    });
  });

  it('handles numeric scale values', () => {
    const messageAmount = 1_000_000_000n;
    const result = getWarpRouteAmountParts(messageAmount, { decimals: 6, scale: 1000 });
    expect(result).toEqual({ amount: 1_000_000n, decimals: 6 });
  });

  it('handles fractional scale {numerator, denominator}', () => {
    // scale = {1, 1e12} means messageAmount = localAmount * 1 / 1e12
    // so localAmount = messageAmount * 1e12 / 1
    const messageAmount = 1_000_000n;
    const result = getWarpRouteAmountParts(messageAmount, {
      decimals: 18,
      scale: { numerator: 1, denominator: 1_000_000_000_000 },
    });
    expect(result).toEqual({ amount: 1_000_000_000_000_000_000n, decimals: 18 });
  });

  it('handles fractional scale with bigint values', () => {
    const messageAmount = 1_000_000n;
    const result = getWarpRouteAmountParts(messageAmount, {
      decimals: 18,
      scale: { numerator: 1n, denominator: 1_000_000_000_000n },
    });
    expect(result).toEqual({ amount: 1_000_000_000_000_000_000n, decimals: 18 });
  });

  it('supports rational object scales', () => {
    const messageAmount = 1_000n;
    const result = getWarpRouteAmountParts(messageAmount, {
      decimals: 6,
      scale: { numerator: 1, denominator: 1000 },
    });
    expect(result).toEqual({ amount: 1_000_000n, decimals: 6 });
  });

  it('defaults to 18 decimals when decimals not provided', () => {
    const messageAmount = 10n ** 18n;
    const result = getWarpRouteAmountParts(messageAmount, {});
    expect(result).toEqual({ amount: 10n ** 18n, decimals: 18 });
  });

  it('falls back to scale=1 for zero scale', () => {
    const messageAmount = 1_000_000n;
    expect(getWarpRouteAmountParts(messageAmount, { decimals: 6, scale: 0 })).toEqual({
      amount: 1_000_000n,
      decimals: 6,
    });
  });

  it('falls back to scale=1 for negative scale', () => {
    const messageAmount = 1_000_000n;
    expect(getWarpRouteAmountParts(messageAmount, { decimals: 6, scale: -10 })).toEqual({
      amount: 1_000_000n,
      decimals: 6,
    });
  });

  it('handles invalid rational scales as invalid (falls back to 1)', () => {
    const messageAmount = 1_000_000n;
    const result = getWarpRouteAmountParts(messageAmount, {
      decimals: 6,
      scale: { numerator: 1.5, denominator: 1 },
    });
    expect(result).toEqual({ amount: 1_000_000n, decimals: 6 });
  });

  it('falls back to scale=1 for NaN numerator in rational scale', () => {
    const messageAmount = 1_000_000n;
    expect(
      getWarpRouteAmountParts(messageAmount, {
        decimals: 6,
        scale: { numerator: Number.NaN, denominator: 1 },
      }),
    ).toEqual({ amount: 1_000_000n, decimals: 6 });
  });

  it('falls back to scale=1 for Infinity numerator in rational scale', () => {
    const messageAmount = 1_000_000n;
    expect(
      getWarpRouteAmountParts(messageAmount, {
        decimals: 6,
        scale: { numerator: Number.POSITIVE_INFINITY, denominator: 1 },
      }),
    ).toEqual({ amount: 1_000_000n, decimals: 6 });
  });

  it('falls back to scale=1 for zero denominator in rational scale', () => {
    const messageAmount = 1_000_000n;
    expect(
      getWarpRouteAmountParts(messageAmount, {
        decimals: 6,
        scale: { numerator: 1, denominator: 0 },
      }),
    ).toEqual({ amount: 1_000_000n, decimals: 6 });
  });

  it('falls back to scale=1 for negative denominator in rational scale', () => {
    const messageAmount = 1_000_000n;
    expect(
      getWarpRouteAmountParts(messageAmount, {
        decimals: 6,
        scale: { numerator: 1, denominator: -1 },
      }),
    ).toEqual({ amount: 1_000_000n, decimals: 6 });
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

  it('explicit scale overrides decimals calculation', () => {
    const messageAmount = 10_200_000_000_000_000_000n;
    const result = getWarpRouteAmountParts(messageAmount, { decimals: 18, scale: 10 });
    expect(result).toEqual({ amount: 1_020_000_000_000_000_000n, decimals: 18 });
  });
});
