import { MultiProvider, chainMetadata } from '@hyperlane-xyz/sdk';

import { ChainConfig } from './features/chains/chainConfig';

let multiProvider: MultiProvider;

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

export function getProvider(chainId) {
  return getMultiProvider().getProvider(chainId);
}
