import { useQuery } from '@tanstack/react-query';

import { useMultiProvider } from '../../../store';
import { Message, MessageStub, WarpRouteDetails } from '../../../types';
import { fetchWarpFees, WarpFeeBreakdown } from './fetchWarpFees';

export function useWarpFees(
  message: Message | MessageStub,
  warpRouteDetails: WarpRouteDetails | undefined,
): WarpFeeBreakdown | null {
  const multiProvider = useMultiProvider();

  const { data } = useQuery({
    // eslint-disable-next-line @tanstack/query/exhaustive-deps
    queryKey: ['warpFees', message.id, warpRouteDetails?.originToken.addressOrDenom],
    queryFn: () => fetchWarpFees(message, warpRouteDetails!, multiProvider),
    enabled: !!warpRouteDetails,
    // Successful results (including legitimate `null` for "no fees detected") never go stale —
    // tx receipts are immutable. Transient errors still retry per React Query defaults.
    staleTime: Infinity,
  });

  return data ?? null;
}
