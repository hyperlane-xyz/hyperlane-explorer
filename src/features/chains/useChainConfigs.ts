import { useMemo } from 'react';
import { z } from 'zod';

import { ChainMetadata, ChainMetadataSchema } from '@hyperlane-xyz/sdk';

import { useStore } from '../../store';
import { fromBase64 } from '../../utils/base64';
import { useQueryParam } from '../../utils/queryParams';

import { ChainConfig } from './chainConfig';

const CHAIN_CONFIGS_KEY = 'chains';

const ChainMetadataArraySchema = z.array(ChainMetadataSchema);

// Use the chainConfigs from the store
export function useChainConfigs() {
  return useStore((s) => ({
    chainConfigs: s.chainConfigs,
    setChainConfigs: s.setChainConfigs,
  }));
}

// Use the chainConfigs from the store but with any
// chainConfigs from the query string merged in
export function useChainConfigsWithQueryParams() {
  const { chainConfigs: storeConfigs } = useChainConfigs();
  const queryVal = useQueryParam(CHAIN_CONFIGS_KEY);
  return useMemo(() => {
    if (!queryVal) return storeConfigs;
    const decoded = fromBase64<ChainMetadata[]>(queryVal);
    if (!decoded) return storeConfigs;
    const result = ChainMetadataArraySchema.safeParse(decoded);
    if (!result.success) return storeConfigs;
    const chainMetadataList = result.data as ChainMetadata[];
    const idToChainConfig = chainMetadataList.reduce<Record<ChainId, ChainConfig>>(
      (acc, chainMetadata) => {
        // TODO would be great if we could get contract addrs here too
        // But would require apps like warp template to get that from devs
        acc[chainMetadata.chainId] = { ...chainMetadata, contracts: { mailbox: '' } };
        return acc;
      },
      {},
    );
    // TODO consider persisting config from query into the store
    return { ...storeConfigs, ...idToChainConfig };
  }, [storeConfigs, queryVal]);
}
