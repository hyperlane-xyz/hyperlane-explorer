import type { IRegistry } from '@hyperlane-xyz/registry';
import { GithubRegistry } from '@hyperlane-xyz/registry';
import type { ChainMap, ChainMetadata, ChainName, WarpCoreConfig } from '@hyperlane-xyz/sdk';
import { objFilter } from '@hyperlane-xyz/utils';
import { useMemo } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { config } from './consts/config';
import {
  ChainMetadataResolver,
  createChainMetadataResolver,
} from './features/chains/metadataManager';
import { DomainsEntry } from './features/chains/queries/fragments';
import { clearPrefetchedMessages } from './features/messages/queries/prefetch';
import {
  TokenArgsWithWireDecimals,
  WarpRouteChainAddressMap,
  WarpRouteConfigs,
  WarpRouteIdToAddressesMap,
} from './types';
import { logger } from './utils/logger';

const PERSIST_STATE_VERSION = 2;

interface MetadataState {
  scrapedDomains: Array<DomainsEntry>;
  setScrapedDomains: (chains: Array<DomainsEntry>) => void;
  chainMetadata: ChainMap<ChainMetadata>;
  chainMetadataOverrides: ChainMap<Partial<ChainMetadata>>;
  setChainMetadataOverrides: (
    overrides?: ChainMap<Partial<ChainMetadata> | undefined>,
  ) => Promise<void>;
  isChainMetadataLoaded: boolean;
  ensureChainMetadata: () => Promise<void>;
  registry: IRegistry;
  setRegistry: (registry: IRegistry) => void;
  bannerClassName: string;
  setBanner: (className: string) => void;
  warpRouteChainAddressMap: WarpRouteChainAddressMap;
  warpRouteIdToAddressesMap: WarpRouteIdToAddressesMap;
  warpRouteConfigs: WarpRouteConfigs;
  isWarpRouteDataLoaded: boolean;
  ensureWarpRouteData: () => Promise<void>;
}

let chainMetadataRequest: {
  overrides: ChainMap<Partial<ChainMetadata>>;
  promise: Promise<ChainMap<ChainMetadata>>;
  registry: IRegistry;
} | null = null;
let warpRouteDataPromise: Promise<{
  warpRouteChainAddressMap: WarpRouteChainAddressMap;
  warpRouteIdToAddressesMap: WarpRouteIdToAddressesMap;
  warpRouteConfigs: WarpRouteConfigs;
}> | null = null;

export const useStore = create<MetadataState>()(
  persist(
    (set, get) => ({
      scrapedDomains: [],
      setScrapedDomains: (domains: Array<DomainsEntry>) => set({ scrapedDomains: domains }),
      chainMetadata: {},
      chainMetadataOverrides: {},
      setChainMetadataOverrides: async (
        overrides: ChainMap<Partial<ChainMetadata> | undefined> = {},
      ) => {
        const filtered = objFilter(overrides, (_, metadata) => !!metadata);
        clearPrefetchedMessages();
        set({
          chainMetadataOverrides: filtered,
          isChainMetadataLoaded: false,
        });
        await get().ensureChainMetadata();
      },
      isChainMetadataLoaded: false,
      ensureChainMetadata: async () => {
        const state = get();
        const { registry, chainMetadataOverrides } = state;
        if (state.isChainMetadataLoaded && Object.keys(state.chainMetadata).length) return;

        if (
          !chainMetadataRequest ||
          chainMetadataRequest.registry !== registry ||
          chainMetadataRequest.overrides !== chainMetadataOverrides
        ) {
          const promise = import('./features/chains/loadChainMetadata').then((mod) =>
            mod.loadChainMetadata(registry, chainMetadataOverrides),
          );
          chainMetadataRequest = {
            registry,
            overrides: chainMetadataOverrides,
            promise,
          };
          promise.finally(() => {
            if (chainMetadataRequest?.promise === promise) {
              chainMetadataRequest = null;
            }
          });
        }

        const metadata = await chainMetadataRequest.promise;
        if (get().registry !== registry || get().chainMetadataOverrides !== chainMetadataOverrides)
          return;

        set({
          chainMetadata: metadata,
          isChainMetadataLoaded: true,
        });
      },
      registry: new GithubRegistry({
        proxyUrl: config.githubProxy,
        uri: config.registryUrl,
        branch: config.registryBranch,
      }),
      setRegistry: (registry: IRegistry) => {
        chainMetadataRequest = null;
        warpRouteDataPromise = null;
        clearPrefetchedMessages();
        set({
          chainMetadata: {},
          isChainMetadataLoaded: false,
          registry,
          warpRouteChainAddressMap: {},
          warpRouteIdToAddressesMap: {},
          warpRouteConfigs: {},
          isWarpRouteDataLoaded: false,
        });
      },
      bannerClassName: '',
      setBanner: (className: string) => set({ bannerClassName: className }),
      warpRouteChainAddressMap: {},
      warpRouteIdToAddressesMap: {},
      warpRouteConfigs: {},
      isWarpRouteDataLoaded: false,
      ensureWarpRouteData: async () => {
        const state = get();
        if (state.isWarpRouteDataLoaded) return;
        const registry = state.registry;

        if (!warpRouteDataPromise) {
          const nextWarpRouteDataPromise = buildWarpRouteMaps(registry);
          warpRouteDataPromise = nextWarpRouteDataPromise;
          nextWarpRouteDataPromise.finally(() => {
            if (warpRouteDataPromise === nextWarpRouteDataPromise) {
              warpRouteDataPromise = null;
            }
          });
        }

        const { warpRouteChainAddressMap, warpRouteIdToAddressesMap, warpRouteConfigs } =
          await warpRouteDataPromise;
        if (get().registry !== registry) return;

        set({
          warpRouteChainAddressMap,
          warpRouteIdToAddressesMap,
          warpRouteConfigs,
          isWarpRouteDataLoaded: true,
        });
      },
    }),
    {
      name: 'hyperlane',
      version: PERSIST_STATE_VERSION,
      partialize: (state) => ({ chainMetadataOverrides: state.chainMetadataOverrides }),
      onRehydrateStorage: () => {
        logger.debug('Rehydrating metadata state');
        return (state, error) => {
          if (error || !state) {
            logger.error('Error during metadata rehydration', error);
            return;
          }
          state
            .ensureChainMetadata()
            .catch((e) => logger.error('Error loading chain metadata after rehydration', e));
        };
      },
    },
  ),
);

export function useRegistry() {
  return useStore((s) => s.registry);
}

export function useChainMetadata(chainName?: ChainName) {
  const chainMetadata = useStore((s) => s.chainMetadata);
  if (!chainName) return undefined;
  return chainMetadata[chainName];
}

export function useChainMetadataMap() {
  return useStore((s) => s.chainMetadata);
}

export function useChainMetadataReady() {
  const isChainMetadataLoaded = useStore((s) => s.isChainMetadataLoaded);
  const chainMetadata = useChainMetadataMap();
  return isChainMetadataLoaded && Object.keys(chainMetadata).length > 0;
}

export function useChainMetadataResolver(): ChainMetadataResolver {
  const chainMetadata = useChainMetadataMap();
  return useMemo(() => createChainMetadataResolver(chainMetadata), [chainMetadata]);
}

export function useWarpRouteIdToAddressesMap() {
  return useStore((s) => s.warpRouteIdToAddressesMap);
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
  } catch (error) {
    logger.error('Failed to build warp route maps from registry', error);
    if (!canUsePublishedWarpRouteFallback(registry)) throw error;

    logger.debug('Using published warp route configs fallback.');
    const { warpRouteConfigs: publishedWarpRouteConfigs } = await import('@hyperlane-xyz/registry');
    warpRouteConfigs = publishedWarpRouteConfigs;
  }

  const warpRouteChainAddressMap: WarpRouteChainAddressMap = {};
  const warpRouteIdToAddressesMap: WarpRouteIdToAddressesMap = {};

  Object.entries(warpRouteConfigs).forEach(([routeId, { tokens }]) => {
    if (!tokens.length) return;

    const wireDecimals = Math.max(...tokens.map((t) => t.decimals ?? 18));
    const routeIdLower = routeId.toLowerCase();
    warpRouteIdToAddressesMap[routeIdLower] = [];

    tokens.forEach((token) => {
      const { chainName, addressOrDenom, connections: _connections, ...rest } = token;
      if (!addressOrDenom) return;

      warpRouteChainAddressMap[chainName] ||= {};
      warpRouteChainAddressMap[chainName][addressOrDenom] = {
        ...rest,
        chainName,
        addressOrDenom,
        wireDecimals,
      } as TokenArgsWithWireDecimals;

      warpRouteIdToAddressesMap[routeIdLower].push({
        chainName,
        address: addressOrDenom,
      });
    });
  });

  return { warpRouteChainAddressMap, warpRouteIdToAddressesMap, warpRouteConfigs };
}

function canUsePublishedWarpRouteFallback(registry: IRegistry) {
  if (!(registry instanceof GithubRegistry)) return false;

  const githubRegistry = registry as GithubRegistry & {
    uri?: string;
    branch?: string;
  };
  return (
    githubRegistry.uri === config.registryUrl && githubRegistry.branch === config.registryBranch
  );
}
