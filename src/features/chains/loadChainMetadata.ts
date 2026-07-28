import type { IRegistry } from '@hyperlane-xyz/registry';
import {
  ChainMetadataSchema,
  mergeChainMetadataMap,
  type ChainMetadata,
} from '@hyperlane-xyz/sdk/metadata/chainMetadataTypes';
import type { ChainMap } from '@hyperlane-xyz/sdk/types';
import { objFilter, objMap, promiseObjAll } from '@hyperlane-xyz/utils';

import { builtinChainMetadata } from '../../consts/chains';
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
    objMap(
      registryChainMetadata,
      async (chainName, metadata): Promise<ChainMetadata> => ({
        ...metadata,
        logoURI: `${links.imgPath}/chains/${chainName}/logo.svg`,
      }),
    ),
  );

  // Builtins sit underneath the registry, which sits underneath user overrides.
  const withBuiltins = mergeChainMetadataMap(builtinChainMetadata, metadataWithLogos);
  const mergedMetadata = mergeChainMetadataMap(withBuiltins, overrideChainMetadata);

  return objFilter(
    objMap(mergedMetadata, (chain, metadata) => {
      const parsedMetadata = ChainMetadataSchema.safeParse(metadata);
      if (parsedMetadata.success) return parsedMetadata.data;

      const fallbackMetadata = withBuiltins[chain];
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
}
