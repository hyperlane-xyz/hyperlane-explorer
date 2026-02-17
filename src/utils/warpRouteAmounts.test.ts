import { getEffectiveDecimals, getWarpRouteAmountParts } from './warpRouteAmounts';

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

  it('non-Cosmos route (origin 6, dest 18): caller passes wireDecimals', () => {
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

describe('getEffectiveDecimals', () => {
  describe('scale takes priority', () => {
    it('returns origin decimals when scale is set', () => {
      const result = getEffectiveDecimals(
        { decimals: 6, scale: 10, wireDecimals: 18 },
        { standard: 'EvmHypCollateral' },
      );
      expect(result).toBe(6);
    });

    it('returns origin decimals when scale is set even for Cosmos', () => {
      const result = getEffectiveDecimals(
        { decimals: 6, scale: 10, standard: 'CW20' },
        { standard: 'EvmHypSynthetic' },
      );
      expect(result).toBe(6);
    });

    it('defaults to 18 when scale is set but decimals missing', () => {
      const result = getEffectiveDecimals({ scale: 10 });
      expect(result).toBe(18);
    });
  });

  describe('Cosmos standards use origin decimals', () => {
    it('returns origin decimals when origin is CW20', () => {
      const result = getEffectiveDecimals(
        { decimals: 6, standard: 'CW20', wireDecimals: 18 },
        { standard: 'EvmHypSynthetic' },
      );
      expect(result).toBe(6);
    });

    it('returns origin decimals when origin is CwHypCollateral', () => {
      const result = getEffectiveDecimals(
        { decimals: 6, standard: 'CwHypCollateral', wireDecimals: 18 },
        { standard: 'EvmHypSynthetic' },
      );
      expect(result).toBe(6);
    });

    it('returns origin decimals when destination is Cosmos', () => {
      const result = getEffectiveDecimals(
        { decimals: 18, standard: 'EvmHypCollateral', wireDecimals: 18 },
        { standard: 'CosmosIcs20' },
      );
      expect(result).toBe(18);
    });

    it('handles CosmosNative standard', () => {
      const result = getEffectiveDecimals(
        { decimals: 6, standard: 'CosmosNative', wireDecimals: 18 },
        undefined,
      );
      expect(result).toBe(6);
    });
  });

  describe('EVM/Sealevel use wireDecimals (max in route)', () => {
    it('returns wireDecimals for EVM→EVM route', () => {
      const result = getEffectiveDecimals(
        { decimals: 6, standard: 'EvmHypCollateral', wireDecimals: 18 },
        { standard: 'EvmHypSynthetic' },
      );
      expect(result).toBe(18);
    });

    it('prefers wireDecimals over maxDecimals (legacy)', () => {
      const result = getEffectiveDecimals(
        { decimals: 6, wireDecimals: 12, maxDecimals: 18 },
        undefined,
      );
      expect(result).toBe(12);
    });

    it('falls back to maxDecimals when wireDecimals not set', () => {
      const result = getEffectiveDecimals(
        { decimals: 6, standard: 'EvmHypCollateral', maxDecimals: 18 },
        { standard: 'EvmHypSynthetic' },
      );
      expect(result).toBe(18);
    });

    it('falls back to origin decimals when no wire/max decimals', () => {
      const result = getEffectiveDecimals(
        { decimals: 6, standard: 'EvmHypCollateral' },
        { standard: 'EvmHypSynthetic' },
      );
      expect(result).toBe(6);
    });
  });

  describe('defaults', () => {
    it('returns 18 when no decimals info available', () => {
      const result = getEffectiveDecimals({}, undefined);
      expect(result).toBe(18);
    });

    it('handles undefined destination token', () => {
      const result = getEffectiveDecimals({ decimals: 6, wireDecimals: 18 }, undefined);
      expect(result).toBe(18);
    });
  });
});
