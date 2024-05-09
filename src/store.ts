import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { GithubRegistry, IRegistry } from '@hyperlane-xyz/registry';
import { ChainMap, MultiProvider } from '@hyperlane-xyz/sdk';

import { ChainConfig } from './features/chains/chainConfig';
import { logger } from './utils/logger';

// Increment this when persist state has breaking changes
const PERSIST_STATE_VERSION = 1;

// Keeping everything here for now as state is simple
// Will refactor into slices as necessary
interface AppState {
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
            .then((mp) => state.setMultiProvider(mp))
            .catch((e) => logger.error('Error building MultiProvider', e));
        };
      },
    },
  ),
);

export function useMultiProvider() {
  return useStore((s) => s.multiProvider);
}

export function useRegistry() {
  return useStore((s) => s.registry);
}

async function buildMultiProvider(registry: IRegistry, customChainConfigs: ChainMap<ChainConfig>) {
  const registryChainMetadata = await registry.getMetadata();
  return new MultiProvider({ ...registryChainMetadata, ...customChainConfigs });
}
