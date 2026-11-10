import { TokenStandard } from '@hyperlane-xyz/sdk/token/TokenStandard';

import { getWarpTokenBalanceKind, getWarpTokenBehavior } from './tokenStandards';

describe('getWarpTokenBehavior', () => {
  it.each([
    TokenStandard.EvmHypCollateral,
    TokenStandard.SealevelHypCollateral,
    TokenStandard.EvmHypCrossCollateralRouter,
    TokenStandard.SealevelHypCrossCollateral,
    TokenStandard.TronHypCrossCollateralRouter,
  ])('describes %s as collateral moving into and out of custody', (standard) => {
    expect(getWarpTokenBehavior(standard)).toEqual({
      type: 'Collateral',
      send: 'Lock',
      receive: 'Release',
    });
  });

  it('distinguishes native collateral from synthetic supply', () => {
    expect(getWarpTokenBehavior(TokenStandard.EvmHypNative)).toEqual({
      type: 'Native',
      send: 'Lock',
      receive: 'Release',
    });
    expect(getWarpTokenBehavior(TokenStandard.SealevelHypSynthetic)).toEqual({
      type: 'Synthetic',
      send: 'Burn',
      receive: 'Mint',
    });
  });

  it.each([TokenStandard.EvmHypXERC20Lockbox, TokenStandard.TronHypVSXERC20Lockbox])(
    'describes the outer asset for %s, not internal xERC20 accounting',
    (standard) => {
      expect(getWarpTokenBehavior(standard)).toEqual({
        type: 'Lockbox',
        send: 'Lock',
        receive: 'Release',
      });
      expect(getWarpTokenBehavior(TokenStandard.EvmHypXERC20)).toEqual({
        type: 'xERC20',
        send: 'Burn',
        receive: 'Mint',
      });
    },
  );

  it.each([TokenStandard.EvmHypCollateralFiat, TokenStandard.TronHypCollateralFiat])(
    'does not mistake %s for lock/release collateral',
    (standard) => {
      expect(getWarpTokenBehavior(standard)).toEqual({
        type: 'Fiat token',
        send: 'Burn',
        receive: 'Mint',
      });
    },
  );

  it.each([
    undefined,
    TokenStandard.ERC20,
    TokenStandard.CosmosIbc,
    TokenStandard.EvmM0Portal,
    TokenStandard.EvmHypEverclearCollateral,
    'FutureHypSynthetic' as TokenStandard,
  ])('avoids asserting token mechanics for unsupported standard %s', (standard) => {
    expect(getWarpTokenBehavior(standard)).toEqual({
      type: 'Token',
      send: 'Send',
      receive: 'Receive',
    });
  });
});

describe('getWarpTokenBalanceKind', () => {
  it.each([
    [TokenStandard.EvmHypCollateral, 'collateral'],
    [TokenStandard.SealevelHypCrossCollateral, 'collateral'],
    [TokenStandard.EvmHypNative, 'collateral'],
    [TokenStandard.SealevelHypNative, 'collateral'],
    [TokenStandard.EvmHypSynthetic, 'supply'],
    [TokenStandard.SealevelHypSynthetic, 'supply'],
    [TokenStandard.EvmHypXERC20, 'supply'],
    [TokenStandard.TronHypVSXERC20, 'supply'],
    [TokenStandard.EvmHypCollateralFiat, 'supply'],
    [TokenStandard.EvmHypXERC20Lockbox, 'lockbox'],
    [TokenStandard.TronHypVSXERC20Lockbox, 'lockbox'],
  ] as const)('identifies the balance represented by %s', (standard, kind) => {
    expect(getWarpTokenBalanceKind(standard)).toBe(kind);
  });

  it.each([
    TokenStandard.EvmHypOwnerCollateral,
    TokenStandard.EvmHypRebaseCollateral,
    TokenStandard.TronHypOwnerCollateral,
    TokenStandard.TronHypRebaseCollateral,
    TokenStandard.EvmHypSyntheticRebase,
    TokenStandard.TronHypSyntheticRebase,
  ])('does not compare encoded shares with asset balances for %s', (standard) => {
    expect(getWarpTokenBalanceKind(standard)).toBeUndefined();
  });

  it.each([
    undefined,
    TokenStandard.ERC20,
    TokenStandard.CosmosIbc,
    TokenStandard.EvmM0Portal,
    TokenStandard.EvmHypEverclearCollateral,
    'FutureHypSynthetic' as TokenStandard,
  ])('leaves unsupported balance semantics unspecified for %s', (standard) => {
    expect(getWarpTokenBalanceKind(standard)).toBeUndefined();
  });
});
