import {
  GithubRegistry,
  IRegistry,
  warpRouteConfigs as publishedWarpRouteConfigs,
} from '@hyperlane-xyz/registry';
import {
  ChainMap,
  ChainMetadata,
  ChainMetadataSchema,
  ChainName,
  MultiProtocolProvider,
  WarpCoreConfig,
  mergeChainMetadataMap,
} from '@hyperlane-xyz/sdk';
import { objFilter, objMap, promiseObjAll } from '@hyperlane-xyz/utils';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { config } from './consts/config';
import { links } from './consts/links';
import { DomainsEntry } from './features/chains/queries/fragments';
import {
  TokenArgsWithWireDecimals,
  WarpRouteChainAddressMap,
  WarpRouteConfigs,
  WarpRouteIdToAddressesMap,
} from './types';
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
  multiProvider: MultiProtocolProvider;
  setMultiProvider: (mp: MultiProtocolProvider) => void;
  registry: IRegistry;
  setRegistry: (registry: IRegistry) => void;
  bannerClassName: string;
  setBanner: (className: string) => void;
  warpRouteChainAddressMap: WarpRouteChainAddressMap;
  setWarpRouteChainAddressMap: (warpRouteChainAddressMap: WarpRouteChainAddressMap) => void;
  warpRouteIdToAddressesMap: WarpRouteIdToAddressesMap;
  setWarpRouteIdToAddressesMap: (warpRouteIdToAddressesMap: WarpRouteIdToAddressesMap) => void;
  warpRouteConfigs: WarpRouteConfigs;
  setWarpRouteConfigs: (warpRouteConfigs: WarpRouteConfigs) => void;
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
        const {
          multiProvider,
          warpRouteChainAddressMap,
          warpRouteIdToAddressesMap,
          warpRouteConfigs,
        } = await buildMultiProvider(get().registry, overrides);
        const filtered = objFilter(overrides, (_, metadata) => !!metadata);
        set({
          chainMetadataOverrides: filtered,
          multiProvider,
          warpRouteChainAddressMap,
          warpRouteIdToAddressesMap,
          warpRouteConfigs,
        });
      },
      multiProvider: new MultiProtocolProvider({}),
      setMultiProvider: (multiProvider: MultiProtocolProvider) => {
        logger.debug('Setting multiProvider in store');
        set({ multiProvider });
      },
      registry: new GithubRegistry({
        proxyUrl: config.githubProxy,
        uri: config.registryUrl,
        branch: config.registryBranch,
      }),
      setRegistry: (registry: IRegistry) => {
        set({ registry });
      },
      bannerClassName: '',
      setBanner: (className: string) => set({ bannerClassName: className }),
      warpRouteChainAddressMap: {},
      setWarpRouteChainAddressMap: (warpRouteChainAddressMap: WarpRouteChainAddressMap) => {
        set({ warpRouteChainAddressMap });
      },
      warpRouteIdToAddressesMap: {},
      setWarpRouteIdToAddressesMap: (warpRouteIdToAddressesMap: WarpRouteIdToAddressesMap) => {
        set({ warpRouteIdToAddressesMap });
      },
      warpRouteConfigs: {},
      setWarpRouteConfigs: (warpRouteConfigs: WarpRouteConfigs) => {
        set({ warpRouteConfigs });
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
            .then(
              ({
                metadata,
                multiProvider,
                warpRouteChainAddressMap,
                warpRouteIdToAddressesMap,
                warpRouteConfigs,
              }) => {
                state.setChainMetadata(metadata);
                state.setMultiProvider(multiProvider);
                state.setWarpRouteChainAddressMap(warpRouteChainAddressMap);
                state.setWarpRouteIdToAddressesMap(warpRouteIdToAddressesMap);
                state.setWarpRouteConfigs(warpRouteConfigs);
                logger.debug('Rehydration complete');
              },
            )
            .catch((e) => logger.error('Error building MultiProtocolProvider', e));
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

export function useChainMetadata(chainName?: ChainName) {
  const multiProvider = useMultiProvider();
  if (!chainName) return undefined;
  return multiProvider.tryGetChainMetadata(chainName);
}

async function buildMultiProvider(
  registry: IRegistry,
  overrideChainMetadata: ChainMap<Partial<ChainMetadata> | undefined>,
) {
  logger.debug('Building new MultiProtocolProvider from registry');

  // TODO improve interface so this pre-cache isn't required
  await registry.listRegistryContent();
  const registryChainMetadata = await registry.getMetadata();

  // TODO have the registry do this automatically
  const metadataWithLogos = await promiseObjAll(
    objMap(
      registryChainMetadata,
      async (chainName, metadata): Promise<ChainMetadata> => ({
        ...metadata,
        logoURI: `${links.imgPath}/chains/${chainName}/logo.svg`,
      }),
    ),
  );

  const mergedMetadata = objFilter(
    mergeChainMetadataMap(metadataWithLogos, overrideChainMetadata),
    (chain, metadata): metadata is ChainMetadata => {
      const parsedMetadata = ChainMetadataSchema.safeParse(metadata);
      if (!parsedMetadata.success) logger.error(`Failed to parse metadata for ${chain}, skipping`);
      return parsedMetadata.success;
    },
  );

  const { warpRouteChainAddressMap, warpRouteIdToAddressesMap, warpRouteConfigs } =
    await buildWarpRouteMaps(registry);

  return {
    metadata: mergedMetadata,
    multiProvider: new MultiProtocolProvider(mergedMetadata),
    warpRouteChainAddressMap,
    warpRouteIdToAddressesMap,
    warpRouteConfigs,
  };
}

export async function buildWarpRouteMaps(registry: IRegistry): Promise<{
  warpRouteChainAddressMap: WarpRouteChainAddressMap;
  warpRouteIdToAddressesMap: WarpRouteIdToAddressesMap;
  warpRouteConfigs: WarpRouteConfigs;
}> {
  let warpRouteConfigs: Record<string, WarpCoreConfig>;

  try {
    logger.debug('Building warp route maps from GithubRegistry');
    warpRouteConfigs = await registry.getWarpRoutes();
  } catch {
    logger.debug(
      'Failed to build warp route maps from GithubRegistry. Using published warp route configs.',
    );
    warpRouteConfigs = publishedWarpRouteConfigs;
  }

  const warpRouteChainAddressMap: WarpRouteChainAddressMap = {};
  const warpRouteIdToAddressesMap: WarpRouteIdToAddressesMap = {};

  Object.entries(warpRouteConfigs).forEach(([routeId, { tokens }]) => {
    if (!tokens.length) return;

    // Calculate the wire decimals (max across all tokens in this warp route)
    // This is the normalized decimal format used in the message body for EVM/Sealevel routes
    const wireDecimals = Math.max(...tokens.map((t) => t.decimals ?? 18));

    // Store route ID -> addresses mapping (lowercase for case-insensitive lookup)
    const routeIdLower = routeId.toLowerCase();
    warpRouteIdToAddressesMap[routeIdLower] = [];

    tokens.forEach((token) => {
      const { chainName, addressOrDenom, connections: _connections, ...rest } = token;
      if (!addressOrDenom) return;

      // Build chain address map
      warpRouteChainAddressMap[chainName] ||= {};
      warpRouteChainAddressMap[chainName][addressOrDenom] = {
        ...rest,
        chainName,
        addressOrDenom,
        wireDecimals,
      } as TokenArgsWithWireDecimals;

      // Build route ID to addresses map
      warpRouteIdToAddressesMap[routeIdLower].push({
        chainName,
        address: addressOrDenom,
      });
    });
  });

  return { warpRouteChainAddressMap, warpRouteIdToAddressesMap, warpRouteConfigs };
}

export function useWarpRouteIdToAddressesMap() {
  return useStore((s) => s.warpRouteIdToAddressesMap);
}
