import create from 'zustand';

import { Environment } from './consts/environments';

// Keeping everything here for now as state is simple
// Will refactor into slices as necessary
interface AppState {
  environment: Environment;
  setEnvironment: (env: Environment) => void;
  bannerClassName: string;
  setBanner: (env: string) => void;
}

export const useStore = create<AppState>()((set) => ({
  environment: Environment.Mainnet,
  setEnvironment: (env: Environment) => set(() => ({ environment: env })),
  bannerClassName: '',
  setBanner: (className: string) => set(() => ({ bannerClassName: className })),
}));
