import { useQuery } from '@tanstack/react-query';

import { useMultiProviderVersion, useReadyMultiProvider } from '../../../store';
import { Message, MessageStub, WarpRouteDetails } from '../../../types';
import { fetchWarpFees, WarpFeeBreakdown } from './fetchWarpFees';

export function useWarpFees(
  message: Message | MessageStub,
  warpRouteDetails: WarpRouteDetails | undefined,
): WarpFeeBreakdown | null {
  const multiProvider = useReadyMultiProvider();
  const multiProviderVersion = useMultiProviderVersion();

  const { data } = useQuery({
    // eslint-disable-next-line @tanstack/query/exhaustive-deps
    queryKey: [
      'warpFees',
      message.id,
      warpRouteDetails?.originToken.addressOrDenom,
      multiProviderVersion,
    ],
    queryFn: () => fetchWarpFees(message, warpRouteDetails!, multiProvider!),
    enabled: !!warpRouteDetails && !!multiProvider,
    // Successful results (including legitimate `null` for "no fees detected") never go stale —
    // tx receipts are immutable. Transient errors still retry per React Query defaults.
    staleTime: Infinity,
  });

  return data ?? null;
}
