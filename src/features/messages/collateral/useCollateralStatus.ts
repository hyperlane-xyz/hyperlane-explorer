import { MultiProtocolProvider, Token } from '@hyperlane-xyz/sdk';
import { toWei } from '@hyperlane-xyz/utils';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';

import { useMultiProvider } from '../../../store';
import { Message, MessageStatus, WarpRouteDetails } from '../../../types';
import { logger } from '../../../utils/logger';

import {
  calculateCollateralStatus,
  CollateralInfo,
  CollateralStatus,
  isCctpRoute,
  isCollateralRoute,
} from './types';

// Query configuration constants
const COLLATERAL_REFETCH_INTERVAL = 30000; // 30 seconds
const COLLATERAL_STALE_TIME = 20000; // 20 seconds

/**
 * Fetches the collateral balance using the SDK's Token class.
 * This properly handles cross-VM collateral checking (EVM, Sealevel, CosmWasm).
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

    // Create Token instance from the destination token config
    const token = new Token(destinationToken);

    // Use SDK's getBalance method which handles cross-VM providers
    // The address parameter should be the router address (destinationToken.addressOrDenom)
    // which holds the collateral
    const tokenAmount = await token.getBalance(multiProvider, destinationToken.addressOrDenom);

    logger.debug('Fetched collateral balance', {
      chain: destinationToken.chainName,
      token: destinationToken.symbol,
      balance: tokenAmount.amount.toString(),
    });

    return tokenAmount.amount;
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
  message: Message | undefined,
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
    return { status: CollateralStatus.Unknown };
  }

  if (isLoading || collateralBalance === undefined) {
    return { status: CollateralStatus.Checking };
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
