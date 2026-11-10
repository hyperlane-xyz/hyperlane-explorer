import {
  ERC4626_COLLATERAL_STANDARDS,
  LOCKBOX_STANDARDS,
  TOKEN_COLLATERALIZED_STANDARDS,
  TOKEN_CROSS_COLLATERAL_STANDARDS,
  TOKEN_HYP_STANDARDS,
  TokenStandard,
  XERC20_STANDARDS,
} from '@hyperlane-xyz/sdk/token/TokenStandard';

export const SUPPORTED_SEALEVEL_BALANCE_STANDARDS: TokenStandard[] = [
  TokenStandard.SealevelHypCollateral,
  TokenStandard.SealevelHypCrossCollateral,
  TokenStandard.SealevelHypNative,
  TokenStandard.SealevelHypSynthetic,
];

export const COLLATERAL_TOKEN_STANDARDS: TokenStandard[] = [
  ...TOKEN_COLLATERALIZED_STANDARDS,
  TokenStandard.EvmHypCollateralFiat,
  TokenStandard.CosmosIbc,
];

export const CROSS_COLLATERAL_TOKEN_STANDARDS: TokenStandard[] = Array.from(
  TOKEN_CROSS_COLLATERAL_STANDARDS,
);

export function isCrossCollateralTokenStandard(standard: string | undefined): boolean {
  if (!standard) return false;
  return CROSS_COLLATERAL_TOKEN_STANDARDS.includes(standard as TokenStandard);
}

export interface WarpTokenBehavior {
  type: 'Collateral' | 'Native' | 'Synthetic' | 'xERC20' | 'Lockbox' | 'Fiat token' | 'Token';
  send: 'Lock' | 'Burn' | 'Send';
  receive: 'Release' | 'Mint' | 'Receive';
}

// Describes the route's user-facing token flow, not evidence of transaction execution.
export function getWarpTokenBehavior(standard: TokenStandard | undefined): WarpTokenBehavior {
  if (standard) {
    if (
      standard === TokenStandard.EvmHypCollateralFiat ||
      standard === TokenStandard.TronHypCollateralFiat
    )
      return { type: 'Fiat token', send: 'Burn', receive: 'Mint' };
    // Lockboxes burn/mint xERC20 internally but lock/release the user's underlying asset.
    if (LOCKBOX_STANDARDS.includes(standard))
      return { type: 'Lockbox', send: 'Lock', receive: 'Release' };
    if (XERC20_STANDARDS.includes(standard))
      return { type: 'xERC20', send: 'Burn', receive: 'Mint' };
    if (TOKEN_HYP_STANDARDS.includes(standard) && standard.includes('Synthetic'))
      return { type: 'Synthetic', send: 'Burn', receive: 'Mint' };
    if (TOKEN_COLLATERALIZED_STANDARDS.includes(standard))
      return {
        type: standard.endsWith('HypNative') ? 'Native' : 'Collateral',
        send: 'Lock',
        receive: 'Release',
      };
  }
  return { type: 'Token', send: 'Send', receive: 'Receive' };
}

// Only compare decoded transfer amounts with balances expressed in the same units.
export function getWarpTokenBalanceKind(
  standard: TokenStandard | undefined,
): 'collateral' | 'supply' | 'lockbox' | undefined {
  if (
    !standard ||
    ERC4626_COLLATERAL_STANDARDS.includes(standard) ||
    standard === TokenStandard.EvmHypSyntheticRebase ||
    standard === TokenStandard.TronHypSyntheticRebase
  )
    return undefined;

  switch (getWarpTokenBehavior(standard).type) {
    case 'Collateral':
    case 'Native':
      return 'collateral';
    case 'Synthetic':
    case 'xERC20':
    case 'Fiat token':
      return 'supply';
    case 'Lockbox':
      return 'lockbox';
    default:
      return undefined;
  }
}
