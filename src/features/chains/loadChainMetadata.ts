import type { IRegistry } from '@hyperlane-xyz/registry';
import {
  ChainMetadataSchema,
  mergeChainMetadataMap,
  type ChainMetadata,
} from '@hyperlane-xyz/sdk/metadata/chainMetadataTypes';
import type { ChainMap } from '@hyperlane-xyz/sdk/types';
import { objFilter, objMap, promiseObjAll } from '@hyperlane-xyz/utils';

import { config } from '../../consts/config';
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
        // The CDN path only serves the canonical registry; when a custom
        // registry is configured, resolve logos through it so its chains are
        // not iconless.
        logoURI: config.registryUrl
          ? ((await registry.getChainLogoUri(chainName)) ??
            `${links.imgPath}/chains/${chainName}/logo.svg`)
          : `${links.imgPath}/chains/${chainName}/logo.svg`,
      }),
    ),
  );

  const mergedMetadata = mergeChainMetadataMap(metadataWithLogos, overrideChainMetadata);

  return objFilter(
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
}
