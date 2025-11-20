import { useQuery } from '@tanstack/react-query';
import { Contract } from 'ethers';
import { useEffect, useMemo } from 'react';

import { useMultiProvider } from '../../../store';
import { Message, WarpRouteDetails } from '../../../types';
import { logger } from '../../../utils/logger';

import {
  calculateCollateralStatus,
  CollateralInfo,
  CollateralStatus,
  isCollateralRoute,
} from './types';

// Minimal ABI for various collateral router types
const COLLATERAL_ROUTER_ABI = [
  // EvmHypCollateral: Returns the address of the underlying collateral token
  'function wrappedToken() view returns (address)',
];

const ERC20_ABI = [
  // Returns the balance of tokens held by an address
  'function balanceOf(address account) view returns (uint256)',
];

/**
 * Fetches the collateral balance for an EVM collateral token.
 * For EvmHypCollateral, we need to:
 * 1. Call wrappedToken() to get the underlying ERC20 token address
 * 2. Call balanceOf(routerAddress) on that token to get locked collateral
 */
async function fetchCollateralBalance(
  destinationToken: WarpRouteDetails['destinationToken'],
  multiProvider: any,
): Promise<bigint | undefined> {
  console.log('[fetchCollateralBalance] Starting fetch for:', {
    chainName: destinationToken.chainName,
    tokenAddress: destinationToken.addressOrDenom,
    standard: destinationToken.standard,
  });

  try {
    const provider = multiProvider.getEthersV5Provider(destinationToken.chainName);
    console.log('[fetchCollateralBalance] Got provider');

    // Create router contract instance
    const routerContract = new Contract(
      destinationToken.addressOrDenom,
      COLLATERAL_ROUTER_ABI,
      provider,
    );
    console.log('[fetchCollateralBalance] Created router contract instance');

    // Get the underlying wrapped token address from the collateral router
    const wrappedTokenAddress = await routerContract.wrappedToken();
    console.log('[fetchCollateralBalance] Got wrapped token address:', wrappedTokenAddress);

    // Query the wrapped token's balance held by the router (this is the collateral)
    const wrappedTokenContract = new Contract(wrappedTokenAddress, ERC20_ABI, provider);
    const balance = await wrappedTokenContract.balanceOf(destinationToken.addressOrDenom);
    console.log('[fetchCollateralBalance] Got collateral balance:', balance.toString());

    return BigInt(balance.toString());
  } catch (error) {
    console.error('[fetchCollateralBalance] Error:', error);
    logger.error('Error fetching collateral balance', error);
    return undefined;
  }
}

export function useCollateralStatus(
  message: Message | undefined,
  warpRouteDetails: WarpRouteDetails | undefined,
): CollateralInfo {
  const multiProvider = useMultiProvider();

  const shouldCheck = useMemo(() => {
    console.log('[useCollateralStatus] Checking if should check collateral:', {
      hasMessage: !!message,
      hasWarpRouteDetails: !!warpRouteDetails,
      messageStatus: message?.status,
      destinationTokenStandard: warpRouteDetails?.destinationToken?.standard,
    });

    if (!message || !warpRouteDetails) {
      console.log('[useCollateralStatus] Missing message or warpRouteDetails');
      return false;
    }

    // TEMPORARY: Check for all message statuses (not just pending) for debugging
    // TODO: Re-enable this check once debugging is complete
    // if (message.status !== 'pending') {
    //   console.log('[useCollateralStatus] Message status is not pending:', message.status);
    //   return false;
    // }

    // Check if this is a collateral-backed route
    // For multicollateral routes (like USDC across multiple chains),
    // we need to check collateral balance as it can run low
    const destStandard = warpRouteDetails.destinationToken.standard;
    const isCollateral = isCollateralRoute(destStandard);
    console.log(
      '[useCollateralStatus] Is collateral route:',
      isCollateral,
      'standard:',
      destStandard,
    );
    return isCollateral;
  }, [message, warpRouteDetails]);

  const destinationToken = useMemo(() => {
    if (!warpRouteDetails || !shouldCheck) {
      console.log('[useCollateralStatus] Skipping destination token:', {
        hasWarpRouteDetails: !!warpRouteDetails,
        shouldCheck,
      });
      return undefined;
    }
    console.log('[useCollateralStatus] Got destination token info:', {
      chainName: warpRouteDetails.destinationToken.chainName,
      address: warpRouteDetails.destinationToken.addressOrDenom,
      standard: warpRouteDetails.destinationToken.standard,
    });
    return warpRouteDetails.destinationToken;
  }, [warpRouteDetails, shouldCheck]);

  const {
    data: collateralBalance,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['collateralBalance', destinationToken, multiProvider],
    queryFn: () => {
      console.log(
        '[useCollateralStatus] Query function called, destinationToken:',
        destinationToken,
      );
      if (!destinationToken) return Promise.resolve(undefined);
      return fetchCollateralBalance(destinationToken, multiProvider);
    },
    enabled: !!destinationToken && shouldCheck,
    refetchInterval: 30000, // Refresh every 30 seconds
    staleTime: 20000, // Consider stale after 20 seconds
  });

  useEffect(() => {
    if (error) {
      console.error('[useCollateralStatus] Query error:', error);
      logger.error('Error in collateral status query', error);
    }
  }, [error]);

  useEffect(() => {
    console.log('[useCollateralStatus] Query state:', {
      isLoading,
      hasBalance: collateralBalance !== undefined,
      balance: collateralBalance?.toString(),
      hasError: !!error,
      shouldCheck,
      hasDestinationToken: !!destinationToken,
    });
  }, [isLoading, collateralBalance, error, shouldCheck, destinationToken]);

  // Return status based on query state
  if (!shouldCheck) {
    console.log('[useCollateralStatus] Returning Unknown - shouldCheck is false');
    return { status: CollateralStatus.Unknown };
  }

  if (isLoading || collateralBalance === undefined) {
    console.log('[useCollateralStatus] Returning Checking:', {
      isLoading,
      hasBalance: collateralBalance !== undefined,
    });
    return { status: CollateralStatus.Checking };
  }

  if (!warpRouteDetails) {
    console.log('[useCollateralStatus] Returning Unknown - no warpRouteDetails');
    return { status: CollateralStatus.Unknown };
  }

  // Parse the transfer amount
  const transferAmount = BigInt(warpRouteDetails.amount);
  const status = calculateCollateralStatus(collateralBalance, transferAmount);
  console.log('[useCollateralStatus] Calculated status:', {
    status: status.status,
    balance: collateralBalance.toString(),
    required: transferAmount.toString(),
    statusDetails: status,
  });

  return status;
}
