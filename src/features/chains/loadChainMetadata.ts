import type { IRegistry } from '@hyperlane-xyz/registry';
import type { ChainMap, ChainMetadata } from '@hyperlane-xyz/sdk';
import { ChainMetadataSchema, mergeChainMetadataMap } from '@hyperlane-xyz/sdk';
import { objFilter, objMap, promiseObjAll } from '@hyperlane-xyz/utils';

import { links } from '../../consts/links';
import { logger } from '../../utils/logger';

export async function loadChainMetadata(
  registry: IRegistry,
  overrideChainMetadata: ChainMap<Partial<ChainMetadata> | undefined>,
) {
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

  return objFilter(
    mergeChainMetadataMap(metadataWithLogos, overrideChainMetadata),
    (chain, metadata): metadata is ChainMetadata => {
      const parsedMetadata = ChainMetadataSchema.safeParse(metadata);
      if (!parsedMetadata.success) logger.error(`Failed to parse metadata for ${chain}, skipping`);
      return parsedMetadata.success;
    },
  );
}
