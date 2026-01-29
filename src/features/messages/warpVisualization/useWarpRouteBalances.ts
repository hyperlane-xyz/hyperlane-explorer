import {
  EvmHypCollateralAdapter,
  EvmHypNativeAdapter,
  EvmHypSyntheticAdapter,
  EvmHypXERC20LockboxAdapter,
  IHypTokenAdapter,
  MultiProtocolProvider,
  TokenStandard,
} from '@hyperlane-xyz/sdk';
import { ProtocolType } from '@hyperlane-xyz/utils';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

import { useMultiProvider } from '../../../store';
import { logger } from '../../../utils/logger';

import { WarpRouteBalances, WarpRouteTokenVisualization } from './types';
import { isCollateralTokenStandard, isCollateralTokenType } from './useWarpRouteVisualization';

// Token standards that support balance fetching
// NOTE: Only EVM chains are supported for balance fetching.
// Sealevel/StarkNet adapters require native dependencies (e.g., @solana/web3.js)
// that cause build errors when imported in the browser bundle.
const SUPPORTED_COLLATERAL_STANDARDS: TokenStandard[] = [
  TokenStandard.EvmHypCollateral,
  TokenStandard.EvmHypNative,
  TokenStandard.EvmHypXERC20Lockbox,
];

const SUPPORTED_SYNTHETIC_STANDARDS: TokenStandard[] = [TokenStandard.EvmHypSynthetic];

/**
 * Check if a token standard is a supported collateral standard
 */
function isSupportedCollateralStandard(standard: TokenStandard | string | undefined): boolean {
  if (!standard) return false;
  return SUPPORTED_COLLATERAL_STANDARDS.includes(standard as TokenStandard);
}

/**
 * Check if a token standard is a supported synthetic standard
 */
function isSupportedSyntheticStandard(standard: TokenStandard | string | undefined): boolean {
  if (!standard) return false;
  return SUPPORTED_SYNTHETIC_STANDARDS.includes(standard as TokenStandard);
}

/**
 * Create the appropriate HypTokenAdapter for a token
 * Only EVM adapters are supported - non-EVM adapters have native dependencies
 * that don't work in the browser bundle
 */
function createHypAdapter(
  multiProvider: MultiProtocolProvider,
  token: WarpRouteTokenVisualization,
): IHypTokenAdapter<unknown> | undefined {
  const { chainName, addressOrDenom, standard } = token;

  if (!chainName || !addressOrDenom || !standard) {
    return undefined;
  }

  const chainMetadata = multiProvider.tryGetChainMetadata(chainName);
  if (!chainMetadata) {
    logger.debug(`Chain ${chainName} not found in multiProvider`);
    return undefined;
  }

  const protocol = chainMetadata.protocol;

  // Only EVM adapters are supported
  if (protocol !== ProtocolType.Ethereum) {
    logger.debug(`Non-EVM chain ${chainName} (${protocol}) - balance fetching not supported`);
    return undefined;
  }

  switch (standard) {
    case TokenStandard.EvmHypCollateral:
      return new EvmHypCollateralAdapter(chainName, multiProvider, { token: addressOrDenom });
    case TokenStandard.EvmHypNative:
      return new EvmHypNativeAdapter(chainName, multiProvider, { token: addressOrDenom });
    case TokenStandard.EvmHypSynthetic:
      return new EvmHypSyntheticAdapter(chainName, multiProvider, { token: addressOrDenom });
    case TokenStandard.EvmHypXERC20Lockbox:
      return new EvmHypXERC20LockboxAdapter(chainName, multiProvider, { token: addressOrDenom });
    default:
      return undefined;
  }
}

/**
 * Fetch the bridged supply for a single token
 */
async function fetchTokenBridgedSupply(
  multiProvider: MultiProtocolProvider,
  token: WarpRouteTokenVisualization,
): Promise<bigint | undefined> {
  try {
    const adapter = createHypAdapter(multiProvider, token);
    if (!adapter) {
      logger.debug(`No adapter available for ${token.chainName}:${token.standard}`);
      return undefined;
    }

    const bridgedSupply = await adapter.getBridgedSupply();

    if (bridgedSupply === undefined) {
      logger.debug(`No bridged supply returned for ${token.chainName}:${token.symbol}`);
      return undefined;
    }

    logger.debug('Fetched bridged supply', {
      chain: token.chainName,
      token: token.symbol,
      balance: bridgedSupply.toString(),
    });

    return bridgedSupply;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.debug(`Failed to fetch bridged supply for ${token.chainName}:${token.symbol}`, {
      standard: token.standard,
      error: errorMessage,
    });
    return undefined;
  }
}

/**
 * Check if a token should have its supply fetched
 */
function shouldFetchSupply(token: WarpRouteTokenVisualization): boolean {
  // Check tokenType if available (fetched from contract)
  if (token.tokenType && isCollateralTokenType(token.tokenType)) {
    return true;
  }
  // Check for synthetic tokenType
  if (token.tokenType?.toLowerCase().includes('synthetic')) {
    return true;
  }
  // Fall back to checking the standard from the config
  if (token.standard && isCollateralTokenStandard(token.standard)) {
    return true;
  }
  // Check using supported standards lists
  if (token.standard && isSupportedCollateralStandard(token.standard)) {
    return true;
  }
  if (token.standard && isSupportedSyntheticStandard(token.standard)) {
    return true;
  }
  return false;
}

/**
 * Fetch balances/supplies for all tokens in a warp route
 */
async function fetchAllBalances(
  multiProvider: MultiProtocolProvider,
  tokens: WarpRouteTokenVisualization[],
): Promise<Record<string, bigint>> {
  const balances: Record<string, bigint> = {};

  const tokensToFetch = tokens.filter(shouldFetchSupply);
  logger.debug(`Fetching supplies for ${tokensToFetch.length} tokens`);

  const promises = tokensToFetch.map(async (token) => {
    const balance = await fetchTokenBridgedSupply(multiProvider, token);
    if (balance !== undefined) {
      balances[token.chainName] = balance;
    }
  });

  await Promise.all(promises);
  return balances;
}

/**
 * Hook to get collateral balances for all tokens in a warp route visualization
 */
export function useWarpRouteBalances(
  tokens: WarpRouteTokenVisualization[] | undefined,
  routeId: string | undefined,
  transferAmount?: bigint,
): WarpRouteBalances {
  const multiProvider = useMultiProvider();
  const queryClient = useQueryClient();

  const tokensToFetch = useMemo(() => tokens?.filter(shouldFetchSupply) || [], [tokens]);

  const queryKey = useMemo(
    () => [
      'warpRouteBalances',
      routeId,
      tokensToFetch.map((t) => `${t.chainName}:${t.addressOrDenom}`).join(','),
    ],
    [routeId, tokensToFetch],
  );

  const {
    data: balances,
    isLoading,
    error,
  } = useQuery({
    // eslint-disable-next-line @tanstack/query/exhaustive-deps -- multiProvider is stable, tokensToFetch is derived from tokens which is in queryKey via chain:address mapping
    queryKey,
    queryFn: () => fetchAllBalances(multiProvider, tokensToFetch),
    enabled: tokensToFetch.length > 0 && !!routeId,
    staleTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey });
  }, [queryClient, queryKey]);

  const balancesWithSufficiency = useMemo(() => {
    if (!balances || !transferAmount) return balances || {};
    return { ...balances };
  }, [balances, transferAmount]);

  return {
    balances: balancesWithSufficiency || {},
    isLoading,
    error: error ? String(error) : undefined,
    refresh,
  };
}

/**
 * Check if a balance is insufficient for a given transfer amount
 */
export function isBalanceInsufficient(
  balance: bigint | undefined,
  requiredAmount: bigint | undefined,
): boolean {
  if (balance === undefined || requiredAmount === undefined) return false;
  return balance < requiredAmount;
}
