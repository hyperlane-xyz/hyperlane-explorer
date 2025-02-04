import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { GithubRegistry, IRegistry } from '@hyperlane-xyz/registry';
import { ChainMap, ChainMetadata, MultiProvider, mergeChainMetadataMap } from '@hyperlane-xyz/sdk';
import { objFilter, objMap, promiseObjAll } from '@hyperlane-xyz/utils';

import { config } from './consts/config';
import { DomainsEntry } from './features/chains/queries/fragments';
import { WarpRouteChainAddressMap } from './types';
import { logger } from './utils/logger';

// Increment this when persist state has breaking changes
const PERSIST_STATE_VERSION = 2;

// Keeping everything here for now as state is simple
// Will refactor into slices as necessary
interface AppState {
  scrapedDomains: Array<DomainsEntry>;
  setScrapedDomains: (chains: Array<DomainsEntry>) => void;
  chainMetadata: ChainMap<ChainMetadata>;
  setChainMetadata: (metadata: ChainMap<ChainMetadata>) => void;
  chainMetadataOverrides: ChainMap<Partial<ChainMetadata>>;
  setChainMetadataOverrides: (overrides?: ChainMap<Partial<ChainMetadata> | undefined>) => void;
  multiProvider: MultiProvider;
  setMultiProvider: (mp: MultiProvider) => void;
  registry: IRegistry;
  setRegistry: (registry: IRegistry) => void;
  bannerClassName: string;
  setBanner: (className: string) => void;
  warpRouteChainAddressMap: WarpRouteChainAddressMap;
  setWarpRoutChainAddresseMap: (warpRouteChainAddressMap: WarpRouteChainAddressMap) => void;
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      scrapedDomains: [],
      setScrapedDomains: (domains: Array<DomainsEntry>) => set({ scrapedDomains: domains }),
      chainMetadata: {},
      setChainMetadata: (metadata: ChainMap<ChainMetadata>) => set({ chainMetadata: metadata }),
      chainMetadataOverrides: {},
      setChainMetadataOverrides: async (
        overrides: ChainMap<Partial<ChainMetadata> | undefined> = {},
      ) => {
        logger.debug('Setting chain overrides in store');
        const { multiProvider } = await buildMultiProvider(get().registry, overrides);
        const filtered = objFilter(overrides, (_, metadata) => !!metadata);
        set({ chainMetadataOverrides: filtered, multiProvider });
      },
      multiProvider: new MultiProvider({}),
      setMultiProvider: (multiProvider: MultiProvider) => {
        logger.debug('Setting multiProvider in store');
        set({ multiProvider });
      },
      registry: new GithubRegistry({ proxyUrl: config.githubProxy }),
      setRegistry: (registry: IRegistry) => {
        set({ registry });
      },
      bannerClassName: '',
      setBanner: (className: string) => set({ bannerClassName: className }),
      warpRouteChainAddressMap: {},
      setWarpRoutChainAddresseMap: (warpRouteChainAddressMap: WarpRouteChainAddressMap) => {
        set({ warpRouteChainAddressMap });
      },
    }),
    {
      name: 'hyperlane', // name in storage
      version: PERSIST_STATE_VERSION,
      partialize: (state) => ({ chainMetadataOverrides: state.chainMetadataOverrides }), // fields to persist
      onRehydrateStorage: () => {
        logger.debug('Rehydrating state');
        return (state, error) => {
          if (error || !state) {
            logger.error('Error during hydration', error);
            return;
          }
          buildMultiProvider(state.registry, state.chainMetadataOverrides)
            .then(({ metadata, multiProvider }) => {
              state.setChainMetadata(metadata);
              state.setMultiProvider(multiProvider);
              logger.debug('Rehydration complete');
            })
            .catch((e) => logger.error('Error building MultiProvider', e));
          buildWarpRouteChainAddressMap(state.registry).then((warpRouteChainAddressMap) => {
            state.setWarpRoutChainAddresseMap(warpRouteChainAddressMap);
          });
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
  if (!multiProvider.getKnownChainNames().length) return undefined;
  return multiProvider;
}

async function buildMultiProvider(
  registry: IRegistry,
  overrideChainMetadata: ChainMap<Partial<ChainMetadata> | undefined>,
) {
  logger.debug('Building new MultiProvider from registry');
  // TODO improve interface so this pre-cache isn't required
  await registry.listRegistryContent();
  const registryChainMetadata = await registry.getMetadata();
  // TODO have the registry do this automatically
  const metadataWithLogos = await promiseObjAll(
    objMap(
      registryChainMetadata,
      async (chainName, metadata): Promise<ChainMetadata> => ({
        ...metadata,
        logoURI: (await registry.getChainLogoUri(chainName)) || undefined,
      }),
    ),
  );
  const mergedMetadata = mergeChainMetadataMap(metadataWithLogos, overrideChainMetadata);
  return { metadata: metadataWithLogos, multiProvider: new MultiProvider(mergedMetadata) };
}

export async function buildWarpRouteChainAddressMap(
  registry: IRegistry,
): Promise<WarpRouteChainAddressMap> {
  try {
    const warpRoutes = await registry.getWarpRoutes();
    return Object.values(warpRoutes).reduce((acc, { tokens }) => {
      tokens.forEach(({ chainName, addressOrDenom, symbol }) => {
        if (!acc[chainName]) {
          acc[chainName] = {};
        }
        acc[chainName][addressOrDenom] = symbol;
      });
      return acc;
    }, {});
  } catch {
    return {};
  }
}
