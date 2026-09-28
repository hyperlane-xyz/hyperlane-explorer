import type { IRegistry } from '@hyperlane-xyz/registry';
import {
  ChainMetadataSchema,
  mergeChainMetadataMap,
  type ChainMetadata,
} from '@hyperlane-xyz/sdk/metadata/chainMetadataTypes';
import type { ChainMap } from '@hyperlane-xyz/sdk/types';
import { objFilter, objMap, promiseObjAll } from '@hyperlane-xyz/utils';

import { links } from '../../consts/links';
import { logger } from '../../utils/logger';

export interface LoadedChainMetadata {
  metadata: ChainMap<ChainMetadata>;
  overrides: ChainMap<Partial<ChainMetadata>>;
}

export async function loadChainMetadata(
  registry: IRegistry,
  overrideChainMetadata: ChainMap<Partial<ChainMetadata> | undefined>,
): Promise<LoadedChainMetadata> {
  for (const chainName of Object.keys(overrideChainMetadata)) {
    if (chainName !== chainName.toLowerCase()) {
      throw new Error(`Override chain names must be lowercase: ${chainName}`);
    }
  }

  logger.debug('Loading chain metadata from registry');

  const registryChainMetadata = await registry.getMetadata();
  const metadataWithLogos = await promiseObjAll(
    objMap(registryChainMetadata, async (chainName, metadata): Promise<ChainMetadata> => ({
      ...metadata,
      logoURI: `${links.imgPath}/chains/${chainName}/logo.svg`,
    })),
  );

  const mergedMetadata = mergeChainMetadataMap(metadataWithLogos, overrideChainMetadata);
  // Only persist overrides whose merged metadata passed validation. Registry
  // fallback keeps the app usable, but should not preserve the invalid input.
  const validMergedChains = new Set<string>();

  const parsedMetadata = objFilter(
    objMap(mergedMetadata, (chain, metadata) => {
      const parsedMetadata = ChainMetadataSchema.safeParse(metadata);
      if (parsedMetadata.success) {
        validMergedChains.add(chain);
        return parsedMetadata.data;
      }

      const fallbackMetadata = metadataWithLogos[chain];
      const parsedFallbackMetadata = ChainMetadataSchema.safeParse(fallbackMetadata);
      logger.error(
        `Failed to parse metadata for ${chain}, ${
          parsedFallbackMetadata.success ? 'falling back to registry metadata' : 'skipping'
        }`,
      );
      return parsedFallbackMetadata.success ? parsedFallbackMetadata.data : undefined;
    }),
    (_chain, metadata): metadata is ChainMetadata => Boolean(metadata),
  );

  const parsedRegistryMetadata = objFilter(
    objMap(metadataWithLogos, (_chain, metadata) => {
      const parsedMetadata = ChainMetadataSchema.safeParse(metadata);
      return parsedMetadata.success ? parsedMetadata.data : undefined;
    }),
    (_chain, metadata): metadata is ChainMetadata => Boolean(metadata),
  );

  return enforceDomainIdOwnership(
    parsedMetadata,
    parsedRegistryMetadata,
    overrideChainMetadata,
    validMergedChains,
  );
}

// URL and localStorage overrides may customize canonical chains, but cannot
// reassign registry domain IDs or claim them for new chains.
function enforceDomainIdOwnership(
  metadata: ChainMap<ChainMetadata>,
  registryChainMetadata: ChainMap<ChainMetadata>,
  overrideChainMetadata: ChainMap<Partial<ChainMetadata> | undefined>,
  validMergedChains: Set<string>,
): LoadedChainMetadata {
  const claimedBy = new Map<number, string>();
  const safeMetadata: ChainMap<ChainMetadata> = {};
  const safeOverrides: ChainMap<Partial<ChainMetadata>> = {};

  // Reserve registry domain IDs before processing user-controlled chains.
  for (const chainName of Object.keys(registryChainMetadata).sort()) {
    const canonicalMetadata = registryChainMetadata[chainName];
    const owner = claimedBy.get(canonicalMetadata.domainId);
    if (owner !== undefined && owner !== chainName) {
      throw new Error(
        `Duplicate canonical domainId ${canonicalMetadata.domainId}: "${owner}" and "${chainName}"`,
      );
    }
    claimedBy.set(canonicalMetadata.domainId, chainName);

    const chainMetadata = metadata[chainName];
    if (!chainMetadata) continue;

    const override = overrideChainMetadata[chainName];
    if (chainMetadata.domainId !== canonicalMetadata.domainId) {
      logger.error(
        `Ignoring domainId override for "${chainName}": canonical domainId is ${canonicalMetadata.domainId}`,
      );
    }

    safeMetadata[chainName] = {
      ...chainMetadata,
      domainId: canonicalMetadata.domainId,
    };

    if (override && validMergedChains.has(chainName)) {
      safeOverrides[chainName] = {
        ...override,
        domainId: canonicalMetadata.domainId,
      };
    }
  }

  for (const chainName of Object.keys(metadata).sort()) {
    if (Object.hasOwn(registryChainMetadata, chainName)) continue;

    const chainMetadata = metadata[chainName];
    const owner = claimedBy.get(chainMetadata.domainId);
    if (owner !== undefined && owner !== chainName) {
      logger.error(
        `Ignoring chain "${chainName}": domainId ${chainMetadata.domainId} already used by "${owner}"`,
      );
      continue;
    }
    claimedBy.set(chainMetadata.domainId, chainName);
    safeMetadata[chainName] = chainMetadata;

    const override = overrideChainMetadata[chainName];
    if (override && validMergedChains.has(chainName)) {
      safeOverrides[chainName] = override;
    }
  }

  return { metadata: safeMetadata, overrides: safeOverrides };
}
