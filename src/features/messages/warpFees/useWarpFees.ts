import { ProtocolType } from '@hyperlane-xyz/utils';
import { skipToken, useQuery } from '@tanstack/react-query';

import { useMultiProviderVersion, useReadyMultiProvider } from '../../../store';
import { Message, MessageStub, WarpRouteDetails } from '../../../types';
import { useOriginTransactionLogs } from '../useOriginTransactionLogs';
import type { WarpFeeBreakdown } from './fetchWarpFees';

export function useWarpFees(
  message: Message | MessageStub,
  warpRouteDetails: WarpRouteDetails | undefined,
): WarpFeeBreakdown | null {
  const multiProvider = useReadyMultiProvider();
  const multiProviderVersion = useMultiProviderVersion();
  const protocol = multiProvider?.tryGetChainMetadata(message.originDomainId)?.protocol;
  const requiresLogs =
    warpRouteDetails?.originToken.decimals !== undefined &&
    (protocol === ProtocolType.Ethereum || protocol === ProtocolType.Tron);
  const { data: logs } = useOriginTransactionLogs(
    message,
    multiProvider,
    multiProviderVersion,
    requiresLogs ? protocol : undefined,
  );

  const { data } = useQuery({
    // eslint-disable-next-line @tanstack/query/exhaustive-deps
    queryKey: [
      'warpFees',
      message.originDomainId,
      message.origin.hash,
      message.msgId,
      warpRouteDetails?.originToken.addressOrDenom,
      multiProviderVersion,
    ],
    queryFn:
      warpRouteDetails && multiProvider && logs
        ? async () => {
            const { fetchWarpFees } = await import('./fetchWarpFees');
            return fetchWarpFees(message, warpRouteDetails, multiProvider, logs);
          }
        : skipToken,
    // Successful results (including legitimate `null` for "no fees detected") never go stale —
    // tx receipts are immutable. Transient errors still retry per React Query defaults.
    staleTime: Infinity,
  });

  return data ?? null;
}
