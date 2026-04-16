import { AggregationIsmConfig, DerivedIsmConfig } from '@hyperlane-xyz/sdk';
import { fromHexString, toHexString, type WithAddress } from '@hyperlane-xyz/utils';

import type {
  AggregationMetadataBuildResult,
  MetadataBuilder,
  MetadataBuildResult,
  MetadataContext,
} from '../metadataTypes';
import type { BaseMetadataBuilder } from './builder';

const RANGE_SIZE = 4;

export class AggregationMetadataBuilder implements MetadataBuilder {
  constructor(private readonly base: BaseMetadataBuilder) {}

  async build(
    context: MetadataContext<WithAddress<AggregationIsmConfig>>,
    maxDepth = 10,
  ): Promise<AggregationMetadataBuildResult> {
    if (maxDepth <= 0) {
      return {
        type: context.ism.type,
        ismAddress: context.ism.address,
        threshold: context.ism.threshold,
        modules: [],
      };
    }

    const modules = await Promise.all(
      context.ism.modules.map(async (module) => {
        try {
          return await this.base.build(
            { ...context, ism: module as DerivedIsmConfig },
            maxDepth - 1,
          );
        } catch {
          const ismModule = module as DerivedIsmConfig;
          return {
            type: ismModule.type,
            ismAddress: ismModule.address,
          } as MetadataBuildResult;
        }
      }),
    );

    const result: AggregationMetadataBuildResult = {
      type: context.ism.type,
      ismAddress: context.ism.address,
      threshold: context.ism.threshold,
      modules,
    };

    const buildableCount = modules.filter((module) => module.metadata !== undefined).length;
    if (buildableCount >= context.ism.threshold) {
      const metadatas = modules.map((module) => module.metadata ?? null);
      let included = 0;
      for (let i = 0; i < metadatas.length; i += 1) {
        if (!metadatas[i]) continue;
        included += 1;
        if (included > context.ism.threshold) metadatas[i] = null;
      }
      result.metadata = AggregationMetadataBuilder.encode(metadatas);
    }

    return result;
  }

  private static rangeIndex(index: number): number {
    return index * 2 * RANGE_SIZE;
  }

  private static encode(submoduleMetadata: Array<string | null>): string {
    const rangeSize = this.rangeIndex(submoduleMetadata.length);
    let encoded = Buffer.alloc(rangeSize, 0);

    submoduleMetadata.forEach((metadata, index) => {
      if (!metadata) return;
      const start = encoded.length;
      encoded = Buffer.concat([encoded, fromHexString(metadata)]);
      const end = encoded.length;
      const rangeStart = this.rangeIndex(index);
      encoded.writeUint32BE(start, rangeStart);
      encoded.writeUint32BE(end, rangeStart + RANGE_SIZE);
    });

    return toHexString(encoded);
  }
}
