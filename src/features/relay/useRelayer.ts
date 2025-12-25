import { HyperlaneRelayer } from '@hyperlane-xyz/relayer';
import { HyperlaneCore, MultiProvider } from '@hyperlane-xyz/sdk';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useReadyMultiProvider, useRegistry, useStore } from '../../store';
import { logger } from '../../utils/logger';

export function useRelayer() {
  const multiProtocolProvider = useReadyMultiProvider();
  const registry = useRegistry();
  const chainMetadata = useStore((s) => s.chainMetadata);

  const { data: addresses } = useQuery({
    queryKey: ['hyperlane-addresses', registry],
    queryFn: async () => {
      return registry.getAddresses();
    },
    enabled: !!registry,
    staleTime: Infinity,
  });

  const evmMultiProvider = useMemo(() => {
    if (!multiProtocolProvider || !chainMetadata) return null;
    try {
      return new MultiProvider(chainMetadata);
    } catch (error) {
      logger.error('Failed to create MultiProvider:', error);
      return null;
    }
  }, [multiProtocolProvider, chainMetadata]);

  const core = useMemo(() => {
    if (!evmMultiProvider || !addresses) return null;
    try {
      return HyperlaneCore.fromAddressesMap(addresses, evmMultiProvider);
    } catch (error) {
      logger.error('Failed to create HyperlaneCore:', error);
      return null;
    }
  }, [evmMultiProvider, addresses]);

  const relayer = useMemo(() => {
    if (!core) return null;
    return new HyperlaneRelayer({ core, caching: true });
  }, [core]);

  return {
    relayer,
    core,
    evmMultiProvider,
    isReady: !!relayer,
  };
}
