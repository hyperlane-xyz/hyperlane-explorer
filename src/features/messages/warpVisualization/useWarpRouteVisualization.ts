import { parseTokenConnectionId } from '@hyperlane-xyz/sdk/token/TokenConnection';
import { TokenStandard } from '@hyperlane-xyz/sdk/token/TokenStandard';
import type { WarpRouteConfigs } from '@hyperlane-xyz/sdk/warp/read';
import type { WarpCoreConfig } from '@hyperlane-xyz/sdk/warp/types';
import { useMemo } from 'react';

import { useStore } from '../../../store';
import { WarpRouteDetails } from '../../../types';
import { logger } from '../../../utils/logger';
import { normalizeAddressToHex } from '../../../utils/yamlParsing';
import { COLLATERAL_TOKEN_STANDARDS } from './tokenStandards';
import { WarpRouteEnrollment, WarpRouteTokenVisualization, WarpRouteVisualization } from './types';

/**
 * Find the warp route config that contains the given token address on the given chain
 */
function tokenMatches(
  token: WarpCoreConfig['tokens'][number],
  tokenAddress: string,
  chainName: string,
) {
  // This compares registry entries against decoded message addresses across protocols.
  // `normalizeAddress` needs a known protocol; this helper also preserves denom fallbacks.
  return (
    token.chainName === chainName &&
    token.addressOrDenom &&
    normalizeAddressToHex(token.addressOrDenom) === normalizeAddressToHex(tokenAddress)
  );
}

function tokenMatchesOptionalEndpoint(
  token: WarpCoreConfig['tokens'][number],
  tokenAddress?: string,
  chainName?: string,
) {
  if (chainName && token.chainName !== chainName) return false;
  if (!tokenAddress) return !!chainName;
  return (
    !!token.addressOrDenom &&
    normalizeAddressToHex(token.addressOrDenom) === normalizeAddressToHex(tokenAddress)
  );
}

function routeMatches(
  config: WarpCoreConfig,
  tokenAddress: string,
  chainName: string,
  destinationTokenAddress?: string,
  destinationChainName?: string,
): boolean {
  const matchesOrigin = config.tokens.some((token) => tokenMatches(token, tokenAddress, chainName));
  if (!matchesOrigin) return false;

  if (!destinationTokenAddress && !destinationChainName) return true;
  return config.tokens.some((token) =>
    tokenMatchesOptionalEndpoint(token, destinationTokenAddress, destinationChainName),
  );
}

export function findWarpRouteConfig(
  warpRouteConfigs: WarpRouteConfigs,
  tokenAddress: string,
  chainName: string,
  destinationTokenAddress?: string,
  destinationChainName?: string,
  preferredRouteId?: string,
): { routeId: string; config: WarpCoreConfig } | undefined {
  const preferredConfig = preferredRouteId ? warpRouteConfigs[preferredRouteId] : undefined;
  if (
    preferredRouteId &&
    preferredConfig &&
    routeMatches(
      preferredConfig,
      tokenAddress,
      chainName,
      destinationTokenAddress,
      destinationChainName,
    )
  ) {
    return { routeId: preferredRouteId, config: preferredConfig };
  }

  let bestMatch: { routeId: string; config: WarpCoreConfig } | undefined;

  for (const [routeId, config] of Object.entries(warpRouteConfigs)) {
    if (
      !routeMatches(config, tokenAddress, chainName, destinationTokenAddress, destinationChainName)
    )
      continue;

    // Tokens can appear in both broad cross-collateral routes and narrower sub-routes.
    // Prefer the most specific matching route, with routeId as a deterministic tiebreaker.
    if (
      !bestMatch ||
      config.tokens.length < bestMatch.config.tokens.length ||
      (config.tokens.length === bestMatch.config.tokens.length &&
        routeId.localeCompare(bestMatch.routeId) < 0)
    ) {
      bestMatch = { routeId, config };
    }
  }

  return bestMatch;
}

function getTokenKey(chainName: string, addressOrDenom: string) {
  return `${chainName}:${normalizeAddressToHex(addressOrDenom)}`;
}

function parseEnrollment(
  tokenId: string,
  tokenByKey: Map<string, WarpCoreConfig['tokens'][number]>,
): WarpRouteEnrollment | undefined {
  try {
    const { chainName, addressOrDenom } = parseTokenConnectionId(tokenId);
    const token = tokenByKey.get(getTokenKey(chainName, addressOrDenom));
    return {
      chainName,
      addressOrDenom,
      symbol: token?.symbol || '',
    };
  } catch (error) {
    logger.debug('Failed to parse warp route token connection', { error, tokenId });
    return undefined;
  }
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
  const destinationTokenAddress = warpRouteDetails?.destinationToken.addressOrDenom;
  const destinationChainName = warpRouteDetails?.destinationToken.chainName;
  const preferredRouteId =
    warpRouteDetails?.originToken.warpRouteId || warpRouteDetails?.destinationToken.warpRouteId;

  const warpRoute = useMemo(() => {
    if (!originTokenAddress) return undefined;
    return findWarpRouteConfig(
      warpRouteConfigs,
      originTokenAddress,
      originChainName!,
      destinationTokenAddress,
      destinationChainName,
      preferredRouteId,
    );
  }, [
    warpRouteConfigs,
    originTokenAddress,
    originChainName,
    destinationTokenAddress,
    destinationChainName,
    preferredRouteId,
  ]);

  // Build the visualization data directly from registry config
  const visualization = useMemo((): WarpRouteVisualization | undefined => {
    if (!warpRoute) return undefined;

    const tokenByKey = new Map(
      warpRoute.config.tokens
        .filter((token) => token.addressOrDenom)
        .map((token) => [getTokenKey(token.chainName, token.addressOrDenom!), token]),
    );

    const tokens: WarpRouteTokenVisualization[] = warpRoute.config.tokens.map((token) => ({
      chainName: token.chainName,
      addressOrDenom: token.addressOrDenom || '',
      symbol: token.symbol || '',
      decimals: token.decimals ?? 18,
      standard: token.standard,
      collateralAddressOrDenom: token.collateralAddressOrDenom,
      enrollments:
        token.connections
          ?.map((connection) => parseEnrollment(connection.token, tokenByKey))
          .filter((enrollment): enrollment is WarpRouteEnrollment => Boolean(enrollment)) ?? [],
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

/**
 * Check if a token standard indicates a collateral-backed token
 */
export function isCollateralTokenStandard(standard: string | undefined): boolean {
  if (!standard) return false;
  return COLLATERAL_TOKEN_STANDARDS.includes(standard as TokenStandard);
}
