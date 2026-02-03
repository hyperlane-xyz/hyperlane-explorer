import {
  EvmERC20WarpRouteReader,
  MultiProtocolProvider,
  MultiProvider,
  TokenType,
  WarpCoreConfig,
} from '@hyperlane-xyz/sdk';
import { ProtocolType } from '@hyperlane-xyz/utils';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { useMultiProvider, useStore } from '../../../store';
import { WarpRouteConfigs, WarpRouteDetails } from '../../../types';
import { logger } from '../../../utils/logger';
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
 * Fetch derived config (owner, token type, fee config) for a single token
 */
async function fetchTokenDerivedConfig(
  multiProvider: MultiProtocolProvider,
  chainName: string,
  tokenAddress: string,
): Promise<{
  tokenType?: string;
  owner?: string;
  feeType?: string;
  feeBps?: number;
}> {
  try {
    // Check if this is an EVM chain
    const chainMetadata = multiProvider.tryGetChainMetadata(chainName);
    if (!chainMetadata || chainMetadata.protocol !== ProtocolType.Ethereum) {
      logger.debug(`Skipping non-EVM chain ${chainName} for derived config`);
      return {};
    }

    // Create an EVM MultiProvider from the chain metadata
    // MultiProvider requires RPC URLs which are in the chainMetadata
    const evmMultiProvider = new MultiProvider({ [chainName]: chainMetadata });

    const reader = new EvmERC20WarpRouteReader(evmMultiProvider, chainName);
    const derivedConfig = await reader.deriveWarpRouteConfig(tokenAddress);

    const result: {
      tokenType?: string;
      owner?: string;
      feeType?: string;
      feeBps?: number;
    } = {
      tokenType: derivedConfig.type,
      owner: derivedConfig.owner,
    };

    // Extract fee info if present
    if (derivedConfig.tokenFee) {
      result.feeType = derivedConfig.tokenFee.type;
      if ('bps' in derivedConfig.tokenFee && derivedConfig.tokenFee.bps !== undefined) {
        result.feeBps = Number(derivedConfig.tokenFee.bps);
      }
    }

    return result;
  } catch (error) {
    logger.warn(`Failed to fetch derived config for ${chainName}:${tokenAddress}`, error);
    return {};
  }
}

/**
 * Fetch derived configs for all tokens in a warp route
 */
async function fetchAllTokenDerivedConfigs(
  multiProvider: MultiProtocolProvider,
  config: WarpCoreConfig,
): Promise<Map<string, Awaited<ReturnType<typeof fetchTokenDerivedConfig>>>> {
  const results = new Map<string, Awaited<ReturnType<typeof fetchTokenDerivedConfig>>>();

  // Fetch all in parallel
  const promises = config.tokens.map(async (token) => {
    if (!token.addressOrDenom) return;
    const key = `${token.chainName}:${token.addressOrDenom}`;
    const derivedConfig = await fetchTokenDerivedConfig(
      multiProvider,
      token.chainName,
      token.addressOrDenom,
    );
    results.set(key, derivedConfig);
  });

  await Promise.all(promises);
  return results;
}

/**
 * Hook to get warp route visualization data for a message
 * @param warpRouteDetails - The warp route details from the message
 * @param fetchDerivedConfigs - Whether to fetch derived configs (owner, tokenType, fees) via RPC.
 *                              Set to false initially to avoid RPC calls, then true when user expands the visualization.
 */
export function useWarpRouteVisualization(
  warpRouteDetails: WarpRouteDetails | undefined,
  fetchDerivedConfigs = false,
): {
  visualization: WarpRouteVisualization | undefined;
  isLoading: boolean;
  error: string | undefined;
} {
  const multiProvider = useMultiProvider();
  const warpRouteConfigs = useStore((s) => s.warpRouteConfigs);

  // Find the matching warp route config
  const warpRoute = useMemo(() => {
    if (!warpRouteDetails?.originToken.addressOrDenom) return undefined;
    return findWarpRouteConfig(
      warpRouteConfigs,
      warpRouteDetails.originToken.addressOrDenom,
      warpRouteDetails.originToken.chainName,
    );
  }, [warpRouteConfigs, warpRouteDetails]);

  // Query key based on route ID
  const queryKey = useMemo(
    () => ['warpRouteVisualization', warpRoute?.routeId],
    [warpRoute?.routeId],
  );

  // Fetch derived configs for all tokens in the route
  // Only fetch when explicitly enabled to avoid excessive RPC calls
  const {
    data: derivedConfigs,
    isLoading,
    error,
  } = useQuery({
    // eslint-disable-next-line @tanstack/query/exhaustive-deps -- warpRoute is derived from warpRouteDetails (stable), multiProvider is stable, warpRoute.config is part of warpRoute
    queryKey,
    queryFn: async () => {
      if (!warpRoute) return undefined;
      return fetchAllTokenDerivedConfigs(multiProvider, warpRoute.config);
    },
    enabled: !!warpRoute && fetchDerivedConfigs,
    staleTime: Infinity, // Config doesn't change - only refetch manually
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  // Build the visualization data
  const visualization = useMemo((): WarpRouteVisualization | undefined => {
    if (!warpRoute) return undefined;

    const tokens: WarpRouteTokenVisualization[] = warpRoute.config.tokens.map((token) => {
      const key = `${token.chainName}:${token.addressOrDenom}`;
      const derived = derivedConfigs?.get(key);

      return {
        chainName: token.chainName,
        addressOrDenom: token.addressOrDenom || '',
        symbol: token.symbol || '',
        decimals: token.decimals ?? 18,
        standard: token.standard,
        logoURI: token.logoURI,
        tokenType: derived?.tokenType,
        owner: derived?.owner,
        feeType: derived?.feeType,
        feeBps: derived?.feeBps,
      };
    });

    return {
      routeId: warpRoute.routeId,
      config: warpRoute.config,
      tokens,
    };
  }, [warpRoute, derivedConfigs]);

  return {
    visualization,
    isLoading,
    error: error ? String(error) : undefined,
  };
}

// Token types that hold collateral (locked funds) - using SDK TokenType enum
const COLLATERAL_TOKEN_TYPES = [
  TokenType.collateral,
  TokenType.collateralVault,
  TokenType.collateralVaultRebase,
  TokenType.collateralFiat,
  TokenType.collateralUri,
  TokenType.XERC20Lockbox,
  TokenType.native,
  TokenType.nativeScaled,
];

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
 * Check if a token type is a collateral type that holds funds
 */
export function isCollateralTokenType(tokenType: string | undefined): boolean {
  if (!tokenType) return false;
  return (COLLATERAL_TOKEN_TYPES as string[]).includes(tokenType);
}

/**
 * Check if a token standard indicates a collateral-backed token
 */
export function isCollateralTokenStandard(standard: string | undefined): boolean {
  if (!standard) return false;
  return COLLATERAL_TOKEN_STANDARDS.includes(standard);
}
