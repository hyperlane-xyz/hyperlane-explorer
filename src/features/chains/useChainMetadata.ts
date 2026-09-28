import { ChainMetadata, ChainMetadataSchema } from '@hyperlane-xyz/sdk/metadata/chainMetadataTypes';
import type { ChainMap } from '@hyperlane-xyz/sdk/types';
import { fromBase64 } from '@hyperlane-xyz/utils';
import { useEffect, useRef } from 'react';
import { z } from 'zod';

import { useStore } from '../../metadataStore';
import { logger } from '../../utils/logger';
import { useQueryParam } from '../../utils/queryParams';

const CHAIN_CONFIGS_KEY = 'chains';

const ChainMetadataArraySchema = z.array(ChainMetadataSchema);

// Look for chainMetadata in the query string and merge them into the store
// Not to be used directly, should only require a single use in ChainConfigSyncer
export function useQueryParamChainConfigSync() {
  const chainMetadataOverrides = useStore((s) => s.chainMetadataOverrides);
  const setChainMetadataOverrides = useStore((s) => s.setChainMetadataOverrides);
  const queryVal = useQueryParam(CHAIN_CONFIGS_KEY);
  // Sanitization may remove a rejected override from the store. Remember the
  // query value so the effect does not immediately add it back in a loop.
  const processedQueryVal = useRef<string | null>(null);

  useEffect(() => {
    if (!queryVal) {
      processedQueryVal.current = null;
      return;
    }
    if (processedQueryVal.current === queryVal) return;
    processedQueryVal.current = queryVal;

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

    if (!chainMetadataList.length) return;

    const nameToChainConfig = chainMetadataList.reduce<ChainMap<ChainMetadata>>(
      (acc, chainMetadata) => {
        // TODO would be great if we could get contract addrs here too
        // But would require apps like warp template to get that from devs
        acc[chainMetadata.name] = chainMetadata;
        return acc;
      },
      {},
    );

    const mergedConfig = { ...chainMetadataOverrides, ...nameToChainConfig };
    setChainMetadataOverrides(mergedConfig).catch((error) => {
      logger.error('Failed to save chain configs from query string', error);
    });
  }, [chainMetadataOverrides, setChainMetadataOverrides, queryVal]);

  return chainMetadataOverrides;
}
