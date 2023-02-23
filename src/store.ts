import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { ChainMetadata } from '@hyperlane-xyz/sdk';

import { Environment } from './consts/environments';

// Keeping everything here for now as state is simple
// Will refactor into slices as necessary
interface AppState {
  chainConfigs: Record<number, ChainMetadata>;
  setChainConfigs: (configs: Record<number, ChainMetadata>) => void;
  environment: Environment;
  setEnvironment: (env: Environment) => void;
  bannerClassName: string;
  setBanner: (className: string) => void;
}

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      chainConfigs: {},
      setChainConfigs: (configs: Record<number, ChainMetadata>) =>
        set(() => ({ chainConfigs: configs })),
      environment: Environment.Mainnet,
      setEnvironment: (env: Environment) => set(() => ({ environment: env })),
      bannerClassName: '',
      setBanner: (className: string) => set(() => ({ bannerClassName: className })),
    }),
    {
      name: 'hyperlane', // name in storage
      partialize: (state) => ({ chainConfigs: state.chainConfigs }), // fields to persist
    },
  ),
);

export function useChainConfigs() {
  return useStore((s) => ({
    chainConfigs: s.chainConfigs,
    setChainConfigs: s.setChainConfigs,
  }));
}

export function useEnvironment() {
  return useStore((s) => ({
    environment: s.environment,
    setEnvironment: s.setEnvironment,
  }));
}
