import { useMemo } from 'react';

import { ChainName, MultiProvider, chainMetadata } from '@hyperlane-xyz/sdk';

import { useChainConfigs } from '../chains/useChainConfigs';

import { HyperlaneSmartProvider } from './SmartProvider';

export class SmartMultiProvider extends MultiProvider {
  // Override to use SmartProvider instead of FallbackProvider
  tryGetProvider(chainNameOrId: ChainName | number): HyperlaneSmartProvider | null {
    const metadata = this.tryGetChainMetadata(chainNameOrId);
    if (!metadata) return null;
    const { name, publicRpcUrls, blockExplorers } = metadata;

    if (!this.providers[name] && (publicRpcUrls?.length || blockExplorers?.length)) {
      this.providers[name] = new HyperlaneSmartProvider(metadata);
    }

    return (this.providers[name] as HyperlaneSmartProvider) || null;
  }
}

export function useMultiProvider() {
  const { chainConfigs } = useChainConfigs();
  const multiProvider = useMemo(
    () => new SmartMultiProvider({ ...chainMetadata, ...chainConfigs }),
    [chainConfigs],
  );
  return multiProvider;
}
