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
    staleTime: Infinity,
  });

  return data ?? null;
}
