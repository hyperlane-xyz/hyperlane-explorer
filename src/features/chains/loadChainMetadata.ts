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

export async function loadChainMetadata(
  registry: IRegistry,
  overrideChainMetadata: ChainMap<Partial<ChainMetadata> | undefined>,
) {
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

  const parsedMetadata = objFilter(
    objMap(mergedMetadata, (chain, metadata) => {
      const parsedMetadata = ChainMetadataSchema.safeParse(metadata);
      if (parsedMetadata.success) return parsedMetadata.data;

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

  return dropDuplicateDomainIds(parsedMetadata, registryChainMetadata);
}

// ChainMetadataSchema validates each chain in isolation, so a (possibly
// user-supplied) override can introduce a chain whose domainId collides with a
// canonical one. Downstream `createChainMetadataResolver` treats a duplicate
// domainId as a broken invariant and throws on the render path, which — because
// overrides are persisted to localStorage and replayed on load — would brick
// the app permanently. Enforce cross-record domainId uniqueness here so the
// resolver never sees a duplicate. Canonical registry chains are processed
// first and always win the domainId; any colliding chain is dropped (and the
// app recovers on next load) rather than crashing.
function dropDuplicateDomainIds(
  metadata: ChainMap<ChainMetadata>,
  registryChainMetadata: ChainMap<unknown>,
): ChainMap<ChainMetadata> {
  const claimedBy = new Map<number, string>();
  const result: ChainMap<ChainMetadata> = {};

  const canonicalFirst = Object.keys(metadata).sort((a, b) => {
    const aCanonical = a in registryChainMetadata;
    const bCanonical = b in registryChainMetadata;
    if (aCanonical === bCanonical) return 0;
    return aCanonical ? -1 : 1;
  });

  for (const chainName of canonicalFirst) {
    const chainMetadata = metadata[chainName];
    const owner = claimedBy.get(chainMetadata.domainId);
    if (owner !== undefined && owner !== chainName) {
      logger.error(
        `Ignoring chain "${chainName}": domainId ${chainMetadata.domainId} already used by "${owner}"`,
      );
      continue;
    }
    claimedBy.set(chainMetadata.domainId, chainName);
    result[chainName] = chainMetadata;
  }

  return result;
}
