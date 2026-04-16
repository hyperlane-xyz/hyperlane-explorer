import { NullIsmConfig } from '@hyperlane-xyz/sdk';
import type { WithAddress } from '@hyperlane-xyz/utils';

import type { BaseMetadataBuildResult, MetadataBuilder, MetadataContext } from '../metadataTypes';

export const NULL_METADATA = '0x';

export class NullMetadataBuilder implements MetadataBuilder {
  async build(
    context: MetadataContext<WithAddress<NullIsmConfig>>,
  ): Promise<BaseMetadataBuildResult> {
    return {
      type: context.ism.type,
      ismAddress: context.ism.address,
      metadata: NULL_METADATA,
    };
  }
}
