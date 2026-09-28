import { ChainMetadata, ChainMetadataSchema } from '@hyperlane-xyz/sdk/metadata/chainMetadataTypes';
import type { ChainMap } from '@hyperlane-xyz/sdk/types';
import { fromBase64 } from '@hyperlane-xyz/utils';
import { useEffect, useRef } from 'react';

import { useStore } from '../../metadataStore';
import { logger } from '../../utils/logger';
import { useQueryParam } from '../../utils/queryParams';

const CHAIN_CONFIGS_KEY = 'chains';

const ChainMetadataArraySchema = ChainMetadataSchema.array();

export function mergeQueryParamChainMetadata(
  chainMetadataList: ChainMetadata[],
  persistedOverrides: ChainMap<Partial<ChainMetadata>>,
  knownChainMetadata: ChainMap<ChainMetadata>,
) {
  const claimedDomainIds = new Map<number, string>();
  for (const [chainName, metadata] of Object.entries(knownChainMetadata)) {
    claimedDomainIds.set(metadata.domainId, chainName);
  }
  for (const [chainName, metadata] of Object.entries(persistedOverrides)) {
    if (metadata.domainId !== undefined) {
      claimedDomainIds.set(metadata.domainId, chainName);
    }
  }

  const queryOverrides = chainMetadataList.reduce<ChainMap<ChainMetadata>>((acc, chainMetadata) => {
    // A URL must never add fields or array entries to an existing saved choice.
    if (persistedOverrides[chainMetadata.name] || acc[chainMetadata.name]) return acc;

    const owner = claimedDomainIds.get(chainMetadata.domainId);
    if (owner !== undefined && owner !== chainMetadata.name) {
      logger.error(
        `Ignoring URL chain "${chainMetadata.name}": domainId ${chainMetadata.domainId} is already used by "${owner}"`,
      );
      return acc;
    }

    // TODO would be great if we could get contract addrs here too
    // But would require apps like warp template to get that from devs
    acc[chainMetadata.name] = chainMetadata;
    claimedDomainIds.set(chainMetadata.domainId, chainMetadata.name);
    return acc;
  }, {});

  return { ...queryOverrides, ...persistedOverrides };
}

// Look for chainMetadata in the query string and merge them into the store
// Not to be used directly, should only require a single use in ChainConfigSyncer
export function useQueryParamChainConfigSync() {
  const chainMetadataOverrides = useStore((s) => s.chainMetadataOverrides);
  const setChainMetadataOverrides = useStore((s) => s.setChainMetadataOverrides);
  const chainMetadata = useStore((s) => s.chainMetadata);
  const isChainMetadataLoaded = useStore((s) => s.isChainMetadataLoaded);
  const queryVal = useQueryParam(CHAIN_CONFIGS_KEY);
  // Sanitization may remove a rejected override from the store. Remember the
  // query value so the effect does not immediately add it back in a loop.
  const processedQueryVal = useRef<string | null>(null);

  useEffect(() => {
    if (!queryVal) {
      processedQueryVal.current = null;
      return;
    }
    // Registry domain IDs must be loaded before URL entries can be checked.
    if (!isChainMetadataLoaded) return;
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

    // Avoid writes when every linked chain already has a saved configuration.
    if (
      !chainMetadataList.length ||
      chainMetadataList.every((chain) => !!chainMetadataOverrides[chain.name])
    )
      return;

    const mergedConfig = mergeQueryParamChainMetadata(
      chainMetadataList,
      chainMetadataOverrides,
      chainMetadata,
    );
    setChainMetadataOverrides(mergedConfig).catch((error) => {
      logger.error('Failed to save chain configs from query string', error);
    });
  }, [
    chainMetadata,
    chainMetadataOverrides,
    isChainMetadataLoaded,
    setChainMetadataOverrides,
    queryVal,
  ]);

  return chainMetadataOverrides;
}
