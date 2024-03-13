import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { ChainMap, MultiProvider, chainMetadata } from '@hyperlane-xyz/sdk';

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
  bannerClassName: string;
  setBanner: (className: string) => void;
}

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      chainConfigs: {},
      setChainConfigs: (configs: ChainMap<ChainConfig>) => {
        set({ chainConfigs: configs, multiProvider: buildMultiProvider(configs) });
      },
      multiProvider: buildMultiProvider({}),
      setMultiProvider: (mp: MultiProvider) => {
        set({ multiProvider: mp });
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
          state.setMultiProvider(buildMultiProvider(state.chainConfigs));
          logger.debug('Hydration finished');
        };
      },
    },
  ),
);

function buildMultiProvider(customChainConfigs: ChainMap<ChainConfig>) {
  return new MultiProvider({ ...chainMetadata, ...customChainConfigs });
}
