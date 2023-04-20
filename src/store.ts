import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { ChainMap } from '@hyperlane-xyz/sdk';

import { Environment } from './consts/environments';
import { ChainConfig } from './features/chains/chainConfig';

// Keeping everything here for now as state is simple
// Will refactor into slices as necessary
interface AppState {
  chainConfigsV2: ChainMap<ChainConfig>; // v2 because schema changed
  setChainConfigs: (configs: ChainMap<ChainConfig>) => void;
  environment: Environment;
  setEnvironment: (env: Environment) => void;
  bannerClassName: string;
  setBanner: (className: string) => void;
}

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      chainConfigsV2: {},
      setChainConfigs: (configs: ChainMap<ChainConfig>) => {
        set(() => ({ chainConfigsV2: configs }));
      },
      environment: Environment.Mainnet,
      setEnvironment: (env: Environment) => set(() => ({ environment: env })),
      bannerClassName: '',
      setBanner: (className: string) => set(() => ({ bannerClassName: className })),
    }),
    {
      name: 'hyperlane', // name in storage
      partialize: (state) => ({ chainConfigsV2: state.chainConfigsV2 }), // fields to persist
    },
  ),
);
