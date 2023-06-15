import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { ChainMap, MultiProvider } from '@ortege/sdk';

import { ChainConfig } from './features/chains/chainConfig';
import { buildSmartProvider } from './features/providers/SmartMultiProvider';
import { logger } from './utils/logger';

// Keeping everything here for now as state is simple
// Will refactor into slices as necessary
interface AppState {
  chainConfigsV2: ChainMap<ChainConfig>; // v2 because schema changed
  setChainConfigs: (configs: ChainMap<ChainConfig>) => void;
  multiProvider: MultiProvider;
  setMultiProvider: (mp: MultiProvider) => void;
  bannerClassName: string;
  setBanner: (className: string) => void;
}

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      chainConfigsV2: {},
      setChainConfigs: (configs: ChainMap<ChainConfig>) => {
        set({ chainConfigsV2: configs, multiProvider: buildSmartProvider(configs) });
      },
      multiProvider: buildSmartProvider({}),
      setMultiProvider: (mp: MultiProvider) => {
        set({ multiProvider: mp });
      },
      bannerClassName: '',
      setBanner: (className: string) => set({ bannerClassName: className }),
    }),
    {
      name: 'hyperlane', // name in storage
      partialize: (state) => ({ chainConfigsV2: state.chainConfigsV2 }), // fields to persist
      onRehydrateStorage: () => {
        logger.debug('Rehydrating state');
        return (state, error) => {
          if (error || !state) {
            logger.error('Error during hydration', error);
            return;
          }
          state.setMultiProvider(buildSmartProvider(state.chainConfigsV2));
          logger.debug('Hydration finished');
        };
      },
    },
  ),
);
