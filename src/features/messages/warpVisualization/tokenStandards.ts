import {
  TOKEN_COLLATERALIZED_STANDARDS,
  TOKEN_CROSS_COLLATERAL_STANDARDS,
  TokenStandard,
} from '@hyperlane-xyz/sdk/token/TokenStandard';

export const SUPPORTED_SEALEVEL_BALANCE_STANDARDS: TokenStandard[] = [
  TokenStandard.SealevelHypCollateral,
  TokenStandard.SealevelHypCrossCollateral,
  TokenStandard.SealevelHypNative,
  TokenStandard.SealevelHypSynthetic,
];

// Cardano balances are read server-side (see pages/api/cardano-warp-route-balance):
// the browser bundle has no Cardano provider and Blockfrost needs a project id.
// Native only for now — a collateral route locks a native asset, not ADA.
export const SUPPORTED_CARDANO_BALANCE_STANDARDS: TokenStandard[] = [
  'CardanoHypNative' as TokenStandard,
];

export const COLLATERAL_TOKEN_STANDARDS: TokenStandard[] = [
  ...TOKEN_COLLATERALIZED_STANDARDS,
  TokenStandard.EvmHypCollateralFiat,
  TokenStandard.CosmosIbc,
  // Cardano standards ship with the cardano protocol changeset
  // (TokenStandard.CardanoHyp*); until this app's SDK version carries them,
  // recognize the strings directly (same pattern as the Starknet workaround
  // in features/messages/collateral/utils.ts).
  'CardanoHypNative' as TokenStandard,
  'CardanoHypCollateral' as TokenStandard,
];

export const CROSS_COLLATERAL_TOKEN_STANDARDS: TokenStandard[] = Array.from(
  TOKEN_CROSS_COLLATERAL_STANDARDS,
);

export function isCrossCollateralTokenStandard(standard: string | undefined): boolean {
  if (!standard) return false;
  return CROSS_COLLATERAL_TOKEN_STANDARDS.includes(standard as TokenStandard);
}
