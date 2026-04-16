import { DefaultFallbackRoutingIsm__factory, IRoutingIsm__factory } from '@hyperlane-xyz/core';
import {
  DerivedIsmConfig,
  DomainRoutingIsmConfig,
  EvmIsmReader,
  IsmType,
  RoutingIsmConfig,
  isDynamicallyRoutedIsmType,
} from '@hyperlane-xyz/sdk';
import type { WithAddress } from '@hyperlane-xyz/utils';

import type {
  MetadataBuilder,
  MetadataContext,
  RoutingMetadataBuildResult,
} from '../metadataTypes';
import type { BaseMetadataBuilder } from './builder';

export class DynamicRoutingMetadataBuilder implements MetadataBuilder {
  constructor(private readonly baseMetadataBuilder: BaseMetadataBuilder) {}

  async build(
    context: MetadataContext<WithAddress<RoutingIsmConfig>>,
    maxDepth = 10,
  ): Promise<RoutingMetadataBuildResult> {
    const { message, ism } = context;
    const originChain = this.baseMetadataBuilder.multiProvider.getChainName(message.parsed.origin);
    const destination = message.parsed.destination;
    const provider = this.baseMetadataBuilder.multiProvider.getProvider(destination);

    const deriveAndRecurse = async (moduleAddress: string): Promise<RoutingMetadataBuildResult> => {
      const ismReader = new EvmIsmReader(this.baseMetadataBuilder.multiProvider, destination);
      const nextConfig = await ismReader.deriveIsmConfig(moduleAddress);
      const selectedIsm = await this.baseMetadataBuilder.build(
        { ...context, ism: nextConfig },
        maxDepth - 1,
      );

      return {
        type: ism.type,
        ismAddress: ism.address,
        originChain,
        selectedIsm,
        metadata: selectedIsm.metadata,
      };
    };

    const staticDomains = (ism as DomainRoutingIsmConfig).domains;
    if (staticDomains?.[originChain]) {
      const selectedIsm = await this.baseMetadataBuilder.build(
        { ...context, ism: staticDomains[originChain] as DerivedIsmConfig },
        maxDepth - 1,
      );
      return {
        type: ism.type,
        ismAddress: ism.address,
        originChain,
        selectedIsm,
        metadata: selectedIsm.metadata,
      };
    }

    if (isDynamicallyRoutedIsmType(ism.type)) {
      const router = IRoutingIsm__factory.connect(ism.address, provider);
      const moduleAddress = await router.route(message.message);
      return deriveAndRecurse(moduleAddress);
    }

    if (ism.type === IsmType.FALLBACK_ROUTING) {
      const fallback = DefaultFallbackRoutingIsm__factory.connect(ism.address, provider);
      const moduleAddress = await fallback.module(message.parsed.origin);
      return deriveAndRecurse(moduleAddress);
    }

    throw new Error(`Unsupported routing ISM type: ${ism.type}`);
  }
}
