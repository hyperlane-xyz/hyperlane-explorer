import { useMemo } from 'react';

import {
  ChainName,
  CoreChainName,
  MultiProvider,
  TestChains,
  chainMetadata,
} from '@hyperlane-xyz/sdk';

import { useChainConfigsWithQueryParams } from '../chains/useChainConfigs';

import { HyperlaneSmartProvider } from './SmartProvider';

export class SmartMultiProvider extends MultiProvider {
  // Override to use SmartProvider instead of FallbackProvider
  tryGetProvider(chainNameOrId: ChainName | number): HyperlaneSmartProvider | null {
    const metadata = this.tryGetChainMetadata(chainNameOrId);
    if (!metadata) return null;
    const { name, publicRpcUrls, blockExplorers } = metadata;

    // TODO fix when sdk is updated
    const providers = this['providers'];
    if (providers[name]) return providers[name];

    if (TestChains.includes(name as CoreChainName)) {
      providers[name] = new providers.JsonRpcProvider('http://localhost:8545', 31337);
    } else if (publicRpcUrls?.length || blockExplorers?.length) {
      providers[name] = new HyperlaneSmartProvider(metadata);
    } else {
      return null;
    }

    return providers[name];
  }
}

export function useMultiProvider() {
  const nameToConfig = useChainConfigsWithQueryParams();
  const multiProvider = useMemo(
    () => new SmartMultiProvider({ ...chainMetadata, ...nameToConfig }),
    [nameToConfig],
  );
  return multiProvider;
}
