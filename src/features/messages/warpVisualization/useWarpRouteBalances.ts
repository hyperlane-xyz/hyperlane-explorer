import {
  EvmHypCollateralAdapter,
  EvmHypNativeAdapter,
  EvmHypSyntheticAdapter,
  EvmHypXERC20Adapter,
  EvmHypXERC20LockboxAdapter,
  IHypTokenAdapter,
  MultiProtocolProvider,
  TokenStandard,
} from '@hyperlane-xyz/sdk';
import { ProtocolType } from '@hyperlane-xyz/utils';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { useMultiProvider } from '../../../store';
import { logger } from '../../../utils/logger';

import { ChainBalance, WarpRouteBalances, WarpRouteTokenVisualization } from './types';
import { isCollateralTokenStandard } from './useWarpRouteVisualization';

// Token standards that support balance fetching
// NOTE: Only EVM chains are supported for balance fetching.
// Sealevel/StarkNet adapters require native dependencies (e.g., @solana/web3.js)
// that cause build errors when imported in the browser bundle.
const SUPPORTED_COLLATERAL_STANDARDS: TokenStandard[] = [
  TokenStandard.EvmHypCollateral,
  TokenStandard.EvmHypNative,
  TokenStandard.EvmHypXERC20Lockbox,
  TokenStandard.EvmHypXERC20,
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
    return undefined;
  }

  const protocol = chainMetadata.protocol;

  // Only EVM adapters are supported
  if (protocol !== ProtocolType.Ethereum) {
    return undefined;
  }

  switch (standard) {
    case TokenStandard.EvmHypCollateral:
      return new EvmHypCollateralAdapter(chainName, multiProvider, { token: addressOrDenom });
    case TokenStandard.EvmHypNative:
      return new EvmHypNativeAdapter(chainName, multiProvider, { token: addressOrDenom });
    case TokenStandard.EvmHypSynthetic:
      return new EvmHypSyntheticAdapter(chainName, multiProvider, { token: addressOrDenom });
    case TokenStandard.EvmHypXERC20:
      return new EvmHypXERC20Adapter(chainName, multiProvider, { token: addressOrDenom });
    case TokenStandard.EvmHypXERC20Lockbox:
      return new EvmHypXERC20LockboxAdapter(chainName, multiProvider, { token: addressOrDenom });
    default:
      return undefined;
  }
}

/**
 * Fetch the balance data for a single token
 */
async function fetchTokenBalance(
  multiProvider: MultiProtocolProvider,
  token: WarpRouteTokenVisualization,
): Promise<ChainBalance | undefined> {
  try {
    const adapter = createHypAdapter(multiProvider, token);
    if (!adapter) {
      return undefined;
    }

    const bridgedSupply = await adapter.getBridgedSupply();
    if (bridgedSupply === undefined) {
      return undefined;
    }

    const result: ChainBalance = { balance: bridgedSupply };

    // For xERC20 lockbox, get both lockbox balance and total xERC20 supply
    if (token.standard === TokenStandard.EvmHypXERC20Lockbox) {
      const lockboxAdapter = adapter as EvmHypXERC20LockboxAdapter;
      try {
        // getBridgedSupply returns lockbox balance for lockbox adapter
        result.lockboxBalance = bridgedSupply;
        // Get total xERC20 supply from the underlying xERC20 token
        const xerc20 = await lockboxAdapter.getXERC20();
        const totalSupply = await xerc20.totalSupply();
        result.xerc20Supply = BigInt(totalSupply.toString());
      } catch (error) {
        logger.debug(`Failed to fetch xERC20 details for ${token.chainName}`, error);
      }
    }

    // For xERC20 (non-lockbox), getBridgedSupply returns total supply
    if (token.standard === TokenStandard.EvmHypXERC20) {
      result.xerc20Supply = bridgedSupply;
    }

    return result;
  } catch (error) {
    logger.debug(`Failed to fetch balance for ${token.chainName}:${token.symbol}`, error);
    return undefined;
  }
}

/**
 * Check if a token should have its supply fetched based on its standard
 */
function shouldFetchSupply(token: WarpRouteTokenVisualization): boolean {
  if (!token.standard) return false;
  // Check if it's a collateral or synthetic standard we can fetch
  return (
    isCollateralTokenStandard(token.standard) ||
    isSupportedCollateralStandard(token.standard) ||
    isSupportedSyntheticStandard(token.standard)
  );
}

/**
 * Fetch balances/supplies for all tokens in a warp route
 */
async function fetchAllBalances(
  multiProvider: MultiProtocolProvider,
  tokens: WarpRouteTokenVisualization[],
): Promise<Record<string, ChainBalance>> {
  const balances: Record<string, ChainBalance> = {};

  const promises = tokens.map(async (token) => {
    const balance = await fetchTokenBalance(multiProvider, token);
    if (balance !== undefined) {
      balances[token.chainName] = balance;
    }
  });

  await Promise.all(promises);
  return balances;
}

/**
 * Hook to get collateral balances for all tokens in a warp route visualization
 * @param tokens - The tokens to fetch balances for
 * @param routeId - The warp route ID for cache key
 * @param transferAmount - Optional transfer amount for sufficiency check
 * @param enabled - Whether to fetch balances. Set to false to defer RPC calls until needed.
 */
export function useWarpRouteBalances(
  tokens: WarpRouteTokenVisualization[] | undefined,
  routeId: string | undefined,
  transferAmount?: bigint,
  enabled = true,
): WarpRouteBalances {
  const multiProvider = useMultiProvider();

  const tokensToFetch = useMemo(() => tokens?.filter(shouldFetchSupply) || [], [tokens]);

  // Create a stable string key from tokens - this prevents queryKey from changing
  // when tokensToFetch array reference changes but content is the same
  const tokensKey = useMemo(
    () => tokensToFetch.map((t) => `${t.chainName}:${t.addressOrDenom}`).join(','),
    [tokensToFetch],
  );

  const queryKey = useMemo(() => ['warpRouteBalances', routeId, tokensKey], [routeId, tokensKey]);

  const {
    data: balances,
    isLoading,
    error,
    refetch,
  } = useQuery({
    // eslint-disable-next-line @tanstack/query/exhaustive-deps -- multiProvider is stable, tokensToFetch is derived from tokens which is in queryKey via chain:address mapping
    queryKey,
    queryFn: () => fetchAllBalances(multiProvider, tokensToFetch),
    enabled: enabled && tokensToFetch.length > 0 && !!routeId,
    staleTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const balancesWithSufficiency = useMemo(() => {
    if (!balances || !transferAmount) return balances || {};
    return { ...balances };
  }, [balances, transferAmount]);

  return {
    balances: balancesWithSufficiency || {},
    isLoading,
    error: error ? String(error) : undefined,
    refetch,
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
