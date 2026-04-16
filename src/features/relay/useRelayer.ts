import { HyperlaneRelayer } from '@hyperlane-xyz/relayer';
import { HyperlaneCore, MultiProvider } from '@hyperlane-xyz/sdk';
import { ProtocolType } from '@hyperlane-xyz/utils';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { useReadyMultiProvider, useRegistry, useStore } from '../../store';
import { logger } from '../../utils/logger';
import { ensureBrowserS3ProxyPatch } from './patchS3ValidatorFetch';

function patchRelayerMetadataTimeouts(relayer: HyperlaneRelayer) {
  const aggregationMetadataBuilder = (relayer as any).metadataBuilder?.aggregationMetadataBuilder;
  if (!aggregationMetadataBuilder || aggregationMetadataBuilder.__explorerTimeoutPatched) {
    return relayer;
  }

  const originalBuild = aggregationMetadataBuilder.build.bind(aggregationMetadataBuilder);
  aggregationMetadataBuilder.build = (
    context: unknown,
    maxDepth = 10,
    timeoutMs = Math.max(30000, maxDepth * 3000),
  ) => {
    return originalBuild(context, maxDepth, timeoutMs);
  };
  aggregationMetadataBuilder.__explorerTimeoutPatched = true;

  return relayer;
}

export function useRelayer() {
  ensureBrowserS3ProxyPatch();

  const runtimeMultiProvider = useReadyMultiProvider();
  const registry = useRegistry();
  const chainMetadata = useStore((s) => s.chainMetadata);

  const { data: addresses } = useQuery({
    queryKey: ['hyperlane-addresses', registry],
    queryFn: async () => registry.getAddresses(),
    enabled: !!registry,
    staleTime: Infinity,
  });

  const evmChainMetadata = useMemo(() => {
    if (!runtimeMultiProvider) return null;

    return Object.fromEntries(
      Object.entries(chainMetadata).filter(
        ([, metadata]) => metadata.protocol === ProtocolType.Ethereum,
      ),
    );
  }, [chainMetadata, runtimeMultiProvider]);

  const evmAddresses = useMemo(() => {
    if (!addresses || !evmChainMetadata) return null;

    return Object.fromEntries(
      Object.entries(addresses).filter(([chainName]) => chainName in evmChainMetadata),
    );
  }, [addresses, evmChainMetadata]);

  const evmMultiProvider = useMemo(() => {
    if (!evmChainMetadata || !Object.keys(evmChainMetadata).length) return null;

    try {
      return new MultiProvider(evmChainMetadata);
    } catch (error) {
      logger.error('Failed to create self-relay MultiProvider', error);
      return null;
    }
  }, [evmChainMetadata]);

  const core = useMemo(() => {
    if (!evmMultiProvider || !evmAddresses || !Object.keys(evmAddresses).length) return null;

    try {
      return HyperlaneCore.fromAddressesMap(evmAddresses, evmMultiProvider);
    } catch (error) {
      logger.error('Failed to create self-relay HyperlaneCore', error);
      return null;
    }
  }, [evmAddresses, evmMultiProvider]);

  const relayer = useMemo(() => {
    if (!core) return null;
    return patchRelayerMetadataTimeouts(new HyperlaneRelayer({ core, caching: true }));
  }, [core]);

  return {
    relayer,
    evmMultiProvider,
    isReady: !!relayer && !!evmMultiProvider,
  };
}
