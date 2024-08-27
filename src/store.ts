import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { GithubRegistry, IRegistry } from '@hyperlane-xyz/registry';
import { ChainMap, MultiProvider } from '@hyperlane-xyz/sdk';

import { ChainConfig } from './features/chains/chainConfig';
import { DomainsEntry } from './features/chains/queries/fragments';
import { logger } from './utils/logger';

// Increment this when persist state has breaking changes
const PERSIST_STATE_VERSION = 1;

// Keeping everything here for now as state is simple
// Will refactor into slices as necessary
interface AppState {
  scrapedChains: Array<DomainsEntry>;
  setScrapedChains: (chains: Array<DomainsEntry>) => void;
  chainConfigs: ChainMap<ChainConfig>;
  setChainConfigs: (configs: ChainMap<ChainConfig>) => void;
  multiProvider: MultiProvider;
  setMultiProvider: (mp: MultiProvider) => void;
  registry: IRegistry;
  setRegistry: (registry: IRegistry) => void;
  bannerClassName: string;
  setBanner: (className: string) => void;
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      scrapedChains: [],
      setScrapedChains: (chains: Array<DomainsEntry>) => set({ scrapedChains: chains }),
      chainConfigs: {},
      setChainConfigs: async (configs: ChainMap<ChainConfig>) => {
        const multiProvider = await buildMultiProvider(get().registry, configs);
        set({ chainConfigs: configs, multiProvider });
      },
      multiProvider: new MultiProvider({}),
      setMultiProvider: (multiProvider: MultiProvider) => {
        set({ multiProvider });
      },
      registry: new GithubRegistry(),
      setRegistry: (registry: IRegistry) => {
        set({ registry });
      },
      bannerClassName: '',
      setBanner: (className: string) => set({ bannerClassName: className }),
    }),
    {
      name: 'hyperlane', // name in storage
      version: PERSIST_STATE_VERSION,
      partialize: (state) => ({ chainConfigs: state.chainConfigs }), // fields to persist
      onRehydrateStorage: () => {
        logger.debug('Rehydrating state');
        return (state, error) => {
          if (error || !state) {
            logger.error('Error during hydration', error);
            return;
          }
          buildMultiProvider(state.registry, state.chainConfigs)
            .then((mp) => {
              state.setMultiProvider(mp);
              logger.debug('Rehydration complete');
            })
            .catch((e) => logger.error('Error building MultiProvider', e));
        };
      },
    },
  ),
);

export function useRegistry() {
  return useStore((s) => s.registry);
}

export function useMultiProvider() {
  return useStore((s) => s.multiProvider);
}

// Ensures that the multiProvider has been populated during the onRehydrateStorage hook above,
// otherwise returns undefined
export function useReadyMultiProvider() {
  const multiProvider = useMultiProvider();
  if (multiProvider.getKnownChainNames().length === 0) return undefined;
  return multiProvider;
}

async function buildMultiProvider(registry: IRegistry, customChainConfigs: ChainMap<ChainConfig>) {
  // TODO improve interface so this pre-cache isn't required
  await registry.listRegistryContent();
  const registryChainMetadata = await registry.getMetadata();
  return new MultiProvider({ ...registryChainMetadata, ...customChainConfigs });
}
