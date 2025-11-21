import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

// eslint-disable-next-line camelcase
import { MovableCollateralRouter__factory } from '@hyperlane-xyz/core';

import { useMultiProvider } from '../../../store';
import { WarpRouteDetails } from '../../../types';
import { logger } from '../../../utils/logger';
import { checkIsMessageDelivered, extractMessageIdFromTx } from '../utils/messageUtils';

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

      const destChainMetadata = multiProvider.tryGetChainMetadata(domain);
      if (!destChainMetadata) continue;

      // Extract message ID from transaction receipt
      const msgId = await extractMessageIdFromTx(txHash, chainName, multiProvider);
      if (!msgId) {
        // If we can't extract the message ID, skip this rebalance
        // (it might be a very old format or non-standard transaction)
        logger.debug('Skipping rebalance without message ID', { txHash, chainName });
        continue;
      }

      // Check if the message has been delivered on the destination chain
      const mailboxAddress = destChainMetadata.mailbox;
      if (!mailboxAddress) {
        logger.debug('No mailbox address for destination chain', {
          destinationChain: destChainMetadata.name,
        });
        continue;
      }

      const deliveryStatus = await checkIsMessageDelivered(
        msgId,
        destChainMetadata.name,
        mailboxAddress,
        multiProvider,
        REBALANCE_EVENT_LOOKBACK_BLOCKS,
      );
      const isDelivered = deliveryStatus.isDelivered;

      const rebalance: RebalanceInfo = {
        messageId: msgId,
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

    // Only check for collateral-backed routes (TokenStandard indicates collateral type)
    // Not all collateral routes support auto-rebalancing - reasons include:
    // 1. Non-EVM chains (Solana, CosmWasm, etc.) - explicitly filtered in fetchActiveRebalances
    // 2. Older collateral tokens deployed before MovableCollateralRouter was introduced
    // 3. Collateral routes that intentionally don't use movable collateral (e.g., TokenType.collateralVault)
    // Since we can't access TokenType from TokenArgs (only TokenStandard), we attempt to query
    // all collateral routes and handle failures gracefully (no events = no active rebalances)
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
    // Use primitive values instead of objects for stable query keys
    // eslint-disable-next-line @tanstack/query/exhaustive-deps
    queryKey: ['activeRebalances', tokenInfo?.chainName, tokenInfo?.address],
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
