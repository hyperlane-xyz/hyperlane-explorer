import { createEvmHypAdapter } from '@hyperlane-xyz/sdk/token/adapters/evmHyp';
import {
  EvmHypVSXERC20LockboxAdapter,
  EvmHypXERC20LockboxAdapter,
} from '@hyperlane-xyz/sdk/token/adapters/EvmTokenAdapter';
import { TokenStandard } from '@hyperlane-xyz/sdk/token/TokenStandard';
import { toWei } from '@hyperlane-xyz/utils';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';

import { useMultiProvider } from '../../../store';
import { Message, MessageStatus, MessageStub, WarpRouteDetails } from '../../../types';
import { logger } from '../../../utils/logger';
import type { ExplorerMultiProvider as MultiProtocolProvider } from '../../hyperlane/sdkRuntime';

import { CollateralInfo, CollateralStatus } from './types';
import { calculateCollateralStatus, isCctpRoute, isCollateralRoute } from './utils';

// Query configuration constants
const COLLATERAL_REFETCH_INTERVAL = 30000; // 30 seconds
const COLLATERAL_STALE_TIME = 20000; // 20 seconds

/**
 * Fetches collateral for EVM hyp tokens without pulling the full runtime Token graph.
 */
async function fetchCollateralBalance(
  destinationToken: WarpRouteDetails['destinationToken'],
  multiProvider: MultiProtocolProvider,
): Promise<bigint | undefined> {
  try {
    // Validate token config
    if (!destinationToken.addressOrDenom || !destinationToken.chainName) {
      logger.warn('Invalid token config: missing address or chain', {
        token: destinationToken.symbol,
        chain: destinationToken.chainName,
      });
      return undefined;
    }

    // Verify chain is configured in multiProvider
    const chainMetadata = multiProvider.tryGetChainMetadata(destinationToken.chainName);
    if (!chainMetadata) {
      logger.warn('Chain not configured in multiProvider', {
        chain: destinationToken.chainName,
        token: destinationToken.symbol,
      });
      return undefined;
    }

    // Verify we can get a provider for this chain
    try {
      multiProvider.tryGetProvider(destinationToken.chainName);
    } catch (providerError) {
      logger.warn('Cannot get provider for chain', {
        chain: destinationToken.chainName,
        error: providerError,
      });
      return undefined;
    }

    const adapter = createEvmHypAdapter(multiProvider, destinationToken);
    if (!adapter) {
      logger.debug('Skipping collateral check for unsupported token runtime', {
        chain: destinationToken.chainName,
        token: destinationToken.symbol,
        standard: destinationToken.standard,
      });
      return undefined;
    }

    // For xERC20 lockboxes, collateral is held by lockbox(), not the router address.
    // Use getBridgedSupply instead; if unavailable, we can't reliably check collateral.
    if (
      destinationToken.standard === TokenStandard.EvmHypXERC20Lockbox ||
      destinationToken.standard === TokenStandard.EvmHypVSXERC20Lockbox
    ) {
      const lockboxAdapter = adapter as EvmHypXERC20LockboxAdapter | EvmHypVSXERC20LockboxAdapter;
      if (
        'getBridgedSupply' in lockboxAdapter &&
        typeof lockboxAdapter.getBridgedSupply === 'function'
      ) {
        try {
          const bridgedSupply = await lockboxAdapter.getBridgedSupply();
          if (bridgedSupply !== undefined) {
            logger.debug('Fetched lockbox collateral from bridged supply', {
              chain: destinationToken.chainName,
              token: destinationToken.symbol,
              balance: bridgedSupply.toString(),
            });
            return bridgedSupply;
          }
        } catch (error) {
          logger.warn('getBridgedSupply failed for lockbox', {
            chain: destinationToken.chainName,
            token: destinationToken.symbol,
            error,
          });
        }
      }
      logger.warn('Bridged supply unavailable for xERC20 lockbox collateral check', {
        chain: destinationToken.chainName,
        token: destinationToken.symbol,
        address: destinationToken.addressOrDenom,
      });
      return undefined;
    }

    // For non-lockbox collateral types, check the router balance directly.
    const tokenAmount = await adapter.getBalance(destinationToken.addressOrDenom);

    logger.debug('Fetched collateral balance', {
      chain: destinationToken.chainName,
      token: destinationToken.symbol,
      balance: tokenAmount.toString(),
    });

    return tokenAmount;
  } catch (error) {
    logger.error('Error fetching collateral balance', {
      error,
      chain: destinationToken.chainName,
      token: destinationToken.symbol,
      address: destinationToken.addressOrDenom,
    });
    return undefined;
  }
}

export function useCollateralStatus(
  message: Message | MessageStub | undefined,
  warpRouteDetails: WarpRouteDetails | undefined,
): CollateralInfo {
  const multiProvider = useMultiProvider();

  const shouldCheck = useMemo(() => {
    if (!message || !warpRouteDetails) {
      return false;
    }

    // Check collateral for any message that hasn't been delivered yet
    // This includes pending, failing, and unknown states
    if (message.status === MessageStatus.Delivered) {
      return false;
    }

    // Skip CCTP routes - they use Circle's burn/mint mechanism, not traditional collateral
    if (isCctpRoute(warpRouteDetails.destinationToken.addressOrDenom)) {
      return false;
    }

    // Check if this is a collateral-backed route
    // For multicollateral routes (like USDC across multiple chains),
    // we need to check collateral balance as it can run low
    const destStandard = warpRouteDetails.destinationToken.standard;
    return isCollateralRoute(destStandard);
  }, [message, warpRouteDetails]);

  const destinationToken = useMemo(() => {
    if (!warpRouteDetails || !shouldCheck) {
      return undefined;
    }
    return warpRouteDetails.destinationToken;
  }, [warpRouteDetails, shouldCheck]);

  // Create stable query key from primitive values
  // We intentionally use only primitives (not the full destinationToken object) for cache key stability
  const queryKey = useMemo(
    () => ['collateralBalance', destinationToken?.chainName, destinationToken?.addressOrDenom],
    [destinationToken?.chainName, destinationToken?.addressOrDenom],
  );

  const {
    data: collateralBalance,
    isLoading,
    error,
  } = useQuery({
    // multiProvider is stable from store and doesn't need to be in the key
    // eslint-disable-next-line @tanstack/query/exhaustive-deps
    queryKey,
    queryFn: () => {
      if (!destinationToken) return Promise.resolve(undefined);
      return fetchCollateralBalance(destinationToken, multiProvider);
    },
    enabled: !!destinationToken && shouldCheck,
    refetchInterval: COLLATERAL_REFETCH_INTERVAL,
    staleTime: COLLATERAL_STALE_TIME,
  });

  useEffect(() => {
    if (error) {
      logger.error('Error in collateral status query', error);
    }
  }, [error]);

  // Return status based on query state
  if (!shouldCheck) {
    if (message?.status === MessageStatus.Delivered) return { status: CollateralStatus.Sufficient };
    return { status: CollateralStatus.Unknown };
  }

  if (isLoading) {
    return { status: CollateralStatus.Checking };
  }

  if (collateralBalance === undefined) {
    return { status: CollateralStatus.Unknown };
  }

  if (!warpRouteDetails) {
    return { status: CollateralStatus.Unknown };
  }

  // Parse the transfer amount from human-readable format to base units
  const decimals = warpRouteDetails.destinationToken.decimals || 18;
  const transferAmount = BigInt(toWei(warpRouteDetails.amount, decimals));
  const status = calculateCollateralStatus(collateralBalance, transferAmount);

  return status;
}
