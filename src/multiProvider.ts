import { MultiProvider, chainMetadata } from '@hyperlane-xyz/sdk';

import { ChainConfig } from './features/chains/chainConfig';

let multiProvider: MultiProvider;

// TODO need a useMultiProvider that takes into account query param chains
// Replace all uses of getMultiProvider with useMultiProvider
export function getMultiProvider() {
  if (!multiProvider) multiProvider = new MultiProvider();
  return multiProvider;
}

export function setMultiProviderChains(customChainConfigs: Record<number, ChainConfig>) {
  const nameToChainConfig = {};
  Object.values(customChainConfigs).forEach((c) => (nameToChainConfig[c.name] = c));
  multiProvider = new MultiProvider({
    ...chainMetadata,
    ...nameToChainConfig,
  });
}

export function getProvider(chainId: ChainId) {
  return getMultiProvider().getProvider(chainId);
}
