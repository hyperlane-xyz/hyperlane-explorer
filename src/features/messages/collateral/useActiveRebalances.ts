import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

// eslint-disable-next-line camelcase
import { MovableCollateralRouter__factory } from '@hyperlane-xyz/core';

import { useMultiProvider } from '../../../store';
import { WarpRouteDetails } from '../../../types';
import { logger } from '../../../utils/logger';

import { ActiveRebalance, RebalanceInfo, isCollateralRoute } from './types';

const REBALANCE_EVENT_LOOKBACK_BLOCKS = 10000; // ~48 hours for most chains

async function fetchActiveRebalances(
  tokenAddress: string,
  chainName: string,
  multiProvider: any,
): Promise<ActiveRebalance> {
  try {
    // Rebalance tracking is currently only supported for EVM chains
    // as it relies on MovableCollateralRouter contracts and event logs
    const chainMetadata = multiProvider.tryGetChainMetadata(chainName);
    if (chainMetadata?.protocol !== 'ethereum') {
      logger.debug('Skipping rebalance tracking for non-EVM chain:', chainName);
      return {
        rebalances: [],
        totalInFlight: 0n,
      };
    }

    const provider = multiProvider.getEthersV5Provider(chainName);
    const currentBlock = await provider.getBlockNumber();

    // Connect to MovableCollateralRouter contract
    // eslint-disable-next-line camelcase
    const router = MovableCollateralRouter__factory.connect(tokenAddress, provider);

    // Query for CollateralMoved events (outbound rebalances)
    const filter = router.filters.CollateralMoved();
    const events = await router.queryFilter(
      filter,
      currentBlock - REBALANCE_EVENT_LOOKBACK_BLOCKS,
      currentBlock,
    );

    const rebalances: RebalanceInfo[] = [];
    let totalInFlight = 0n;

    for (const event of events) {
      if (!event.args) continue;

      const { domain, amount } = event.args;
      const txHash = event.transactionHash;

      // Get timestamp from block
      const block = await provider.getBlock(event.blockNumber);
      const timestamp = block?.timestamp || 0;

      // For now, assume rebalances within lookback window are potentially in-flight
      // In a full implementation, query message delivery status
      const isDelivered = false; // TODO: Check actual message delivery status

      const destChainMetadata = multiProvider.tryGetChainMetadata(domain);

      if (!destChainMetadata) continue;

      const rebalance: RebalanceInfo = {
        messageId: '', // TODO: Extract from event logs or transaction receipt
        amount: BigInt(amount.toString()),
        originChain: chainName,
        destinationChain: destChainMetadata.name,
        timestamp,
        txHash,
        isDelivered,
      };

      rebalances.push(rebalance);

      if (!isDelivered) {
        totalInFlight += rebalance.amount;
      }
    }

    return {
      rebalances,
      totalInFlight,
    };
  } catch (error) {
    logger.error('Error fetching active rebalances', error);
    return {
      rebalances: [],
      totalInFlight: 0n,
    };
  }
}

export function useActiveRebalances(
  warpRouteDetails: WarpRouteDetails | undefined,
): ActiveRebalance | undefined {
  const multiProvider = useMultiProvider();

  const shouldCheck = useMemo(() => {
    if (!warpRouteDetails) return false;

    // Only check for collateral-backed routes
    const destStandard = warpRouteDetails.destinationToken.standard;
    return isCollateralRoute(destStandard);
  }, [warpRouteDetails]);

  const tokenInfo = useMemo(() => {
    if (!warpRouteDetails || !shouldCheck) return undefined;
    const { destinationToken } = warpRouteDetails;
    return {
      address: destinationToken.addressOrDenom,
      chainName: destinationToken.chainName,
    };
  }, [warpRouteDetails, shouldCheck]);

  const { data: activeRebalances } = useQuery({
    queryKey: ['activeRebalances', tokenInfo, multiProvider],
    queryFn: () => {
      if (!tokenInfo) return Promise.resolve(undefined);
      return fetchActiveRebalances(tokenInfo.address, tokenInfo.chainName, multiProvider);
    },
    enabled: !!tokenInfo && shouldCheck,
    refetchInterval: 60000, // Refresh every minute
    staleTime: 45000, // Consider stale after 45 seconds
  });

  return activeRebalances;
}
