import { WarpCoreConfig } from '@hyperlane-xyz/sdk';
import { useMemo } from 'react';

import { useStore } from '../../../store';
import { WarpRouteConfigs, WarpRouteDetails } from '../../../types';
import { normalizeAddressToHex } from '../../../utils/yamlParsing';

import { WarpRouteTokenVisualization, WarpRouteVisualization } from './types';

/**
 * Find the warp route config that contains the given token address on the given chain
 */
function findWarpRouteConfig(
  warpRouteConfigs: WarpRouteConfigs,
  tokenAddress: string,
  chainName: string,
): { routeId: string; config: WarpCoreConfig } | undefined {
  for (const [routeId, config] of Object.entries(warpRouteConfigs)) {
    const match = config.tokens.find(
      (t) =>
        t.chainName === chainName &&
        t.addressOrDenom &&
        normalizeAddressToHex(t.addressOrDenom) === normalizeAddressToHex(tokenAddress),
    );
    if (match) return { routeId, config };
  }
  return undefined;
}

/**
 * Hook to get warp route visualization data for a message.
 * Uses only registry data (no RPC calls) for token type information.
 */
export function useWarpRouteVisualization(warpRouteDetails: WarpRouteDetails | undefined): {
  visualization: WarpRouteVisualization | undefined;
} {
  const warpRouteConfigs = useStore((s) => s.warpRouteConfigs);

  // Find the matching warp route config
  // Memoize based on the actual values that matter, not the object references
  const originTokenAddress = warpRouteDetails?.originToken.addressOrDenom;
  const originChainName = warpRouteDetails?.originToken.chainName;

  const warpRoute = useMemo(() => {
    if (!originTokenAddress) return undefined;
    return findWarpRouteConfig(warpRouteConfigs, originTokenAddress, originChainName!);
  }, [warpRouteConfigs, originTokenAddress, originChainName]);

  // Build the visualization data directly from registry config
  const visualization = useMemo((): WarpRouteVisualization | undefined => {
    if (!warpRoute) return undefined;

    const tokens: WarpRouteTokenVisualization[] = warpRoute.config.tokens.map((token) => ({
      chainName: token.chainName,
      addressOrDenom: token.addressOrDenom || '',
      symbol: token.symbol || '',
      decimals: token.decimals ?? 18,
      standard: token.standard,
      logoURI: token.logoURI,
    }));

    return {
      routeId: warpRoute.routeId,
      config: warpRoute.config,
      tokens,
    };
  }, [warpRoute]);

  return { visualization };
}

// Token standards that indicate collateral-backed tokens
const COLLATERAL_TOKEN_STANDARDS = [
  'EvmHypCollateral',
  'EvmHypCollateralFiat',
  'EvmHypNative',
  'EvmHypNativeScaled',
  'EvmHypXERC20Lockbox',
  'SealevelHypCollateral',
  'SealevelHypNative',
  'CwHypCollateral',
  'CwHypNative',
  'CosmosIbc', // IBC tokens often represent collateral
  'StarknetHypCollateral',
  'StarknetHypNative',
];

/**
 * Check if a token standard indicates a collateral-backed token
 */
export function isCollateralTokenStandard(standard: string | undefined): boolean {
  if (!standard) return false;
  return COLLATERAL_TOKEN_STANDARDS.includes(standard);
}
