import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { Environment } from './consts/environments';
import { ChainConfig } from './features/chains/chainConfig';
import { setMultiProviderChains } from './multiProvider';
import { logger } from './utils/logger';

// Keeping everything here for now as state is simple
// Will refactor into slices as necessary
interface AppState {
  chainConfigs: Record<ChainId, ChainConfig>;
  setChainConfigs: (configs: Record<ChainId, ChainConfig>) => void;
  environment: Environment;
  setEnvironment: (env: Environment) => void;
  bannerClassName: string;
  setBanner: (className: string) => void;
}

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      chainConfigs: {},
      setChainConfigs: (configs: Record<ChainId, ChainConfig>) => {
        set(() => ({ chainConfigs: configs }));
        setMultiProviderChains(configs);
      },
      environment: Environment.Mainnet,
      setEnvironment: (env: Environment) => set(() => ({ environment: env })),
      bannerClassName: '',
      setBanner: (className: string) => set(() => ({ bannerClassName: className })),
    }),
    {
      name: 'hyperlane', // name in storage
      partialize: (state) => ({ chainConfigs: state.chainConfigs }), // fields to persist
      onRehydrateStorage: () => (state, error) => {
        if (state?.chainConfigs) setMultiProviderChains(state.chainConfigs);
        else if (error) logger.debug('Error rehydrating store', error);
      },
    },
  ),
);
