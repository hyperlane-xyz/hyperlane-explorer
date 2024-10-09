import { useEffect } from 'react';
import { z } from 'zod';

import {
  ChainMap,
  ChainMetadata,
  ChainMetadataSchema,
  mergeChainMetadataMap,
} from '@hyperlane-xyz/sdk';
import { fromBase64 } from '@hyperlane-xyz/utils';

import { useStore } from '../../store';
import { logger } from '../../utils/logger';
import { useQueryParam } from '../../utils/queryParams';

const CHAIN_CONFIGS_KEY = 'chains';

const ChainMetadataArraySchema = z.array(ChainMetadataSchema);

// Look for chainMetadata in the query string and merge them into the store
// Not to be used directly, should only require a single use in ChainConfigSyncer
export function useQueryParamChainConfigSync() {
  const { chainMetadataOverrides, setChainMetadataOverrides } = useStore((s) => ({
    chainMetadataOverrides: s.chainMetadataOverrides,
    setChainMetadataOverrides: s.setChainMetadataOverrides,
  }));
  const queryVal = useQueryParam(CHAIN_CONFIGS_KEY);

  useEffect(() => {
    if (!queryVal) return;
    const decoded = fromBase64<ChainMetadata[]>(queryVal);
    if (!decoded) {
      logger.error('Unable to decode chain configs in query string');
      return;
    }
    const result = ChainMetadataArraySchema.safeParse(decoded);
    if (!result.success) {
      logger.error('Invalid chain configs in query string', result.error);
      return;
    }
    const chainMetadataList = result.data as ChainMetadata[];

    // Stop here if there are no new configs to save, otherwise the effect will loop
    if (
      !chainMetadataList.length ||
      chainMetadataList.every((c) => !!chainMetadataOverrides[c.name])
    )
      return;

    const nameToChainConfig = chainMetadataList.reduce<ChainMap<ChainMetadata>>(
      (acc, chainMetadata) => {
        // TODO would be great if we could get contract addrs here too
        // But would require apps like warp template to get that from devs
        acc[chainMetadata.name] = chainMetadata;
        return acc;
      },
      {},
    );

    const mergedConfig = mergeChainMetadataMap(nameToChainConfig, chainMetadataOverrides);
    setChainMetadataOverrides(mergedConfig);
  }, [chainMetadataOverrides, setChainMetadataOverrides, queryVal]);

  return chainMetadataOverrides;
}
