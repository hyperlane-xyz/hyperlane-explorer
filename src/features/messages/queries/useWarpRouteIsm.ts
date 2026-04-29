import { useQuery } from '@tanstack/react-query';
import type { ethers } from 'ethers';
import { useMemo } from 'react';

import { useStore } from '../../../metadataStore';
import { useReadyMultiProvider } from '../../../store';
import { logger } from '../../../utils/logger';
import { fetchWarpRouteIsm, type WarpRouteIsmResult } from './fetchWarpRouteIsm';

interface UseWarpRouteIsmInput {
  originChainName: string | undefined;
  originTokenAddress: string | undefined;
  destinationChainName: string | undefined;
  destinationTokenAddress: string | undefined;
  enabled: boolean;
}

interface UseWarpRouteIsmResult {
  data: WarpRouteIsmResult | undefined;
  isLoading: boolean;
  error: string | undefined;
}

export function useWarpRouteIsm({
  originChainName,
  originTokenAddress,
  destinationChainName,
  destinationTokenAddress,
  enabled,
}: UseWarpRouteIsmInput): UseWarpRouteIsmResult {
  const chainMetadata = useStore((s) => s.chainMetadata);
  const explorerMultiProvider = useReadyMultiProvider();

  const queryKey = useMemo(
    () => [
      'warpRouteIsm',
      originChainName,
      originTokenAddress,
      destinationChainName,
      destinationTokenAddress,
    ],
    [originChainName, originTokenAddress, destinationChainName, destinationTokenAddress],
  );

  const isReady =
    enabled &&
    !!explorerMultiProvider &&
    !!originChainName &&
    !!originTokenAddress &&
    !!destinationChainName &&
    !!destinationTokenAddress &&
    Object.keys(chainMetadata).length > 0;

  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn: ({ signal }) => {
      logger.debug('Fetching warp route ISM details', queryKey);
      const providers: Record<string, ethers.providers.Provider> = {};
      for (const chain of [originChainName!, destinationChainName!]) {
        try {
          providers[chain] = explorerMultiProvider!.getEthersV5Provider(
            chain,
          ) as ethers.providers.Provider;
        } catch (e) {
          logger.debug(`No ethers provider for ${chain}`, e);
        }
      }
      return fetchWarpRouteIsm({
        chainMetadata,
        providers,
        origin: { chainName: originChainName!, tokenAddress: originTokenAddress! },
        destination: {
          chainName: destinationChainName!,
          tokenAddress: destinationTokenAddress!,
        },
        signal,
      });
    },
    enabled: isReady,
    retry: false,
    staleTime: Infinity,
    gcTime: 0,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  return {
    data,
    isLoading: isLoading && isReady,
    error: error ? String(error) : undefined,
  };
}
