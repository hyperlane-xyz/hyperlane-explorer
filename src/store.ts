import { create } from 'zustand';

import {
  createEmptyMultiProvider,
  createRuntimeMultiProvider,
  type ExplorerMultiProvider,
} from './features/hyperlane/sdkRuntime';
import { useStore as useMetadataStore } from './metadataStore';
import { logger } from './utils/logger';

export {
  useChainMetadata,
  useRegistry,
  useStore,
  useWarpRouteIdToAddressesMap,
} from './metadataStore';

interface ProviderState {
  multiProvider: ExplorerMultiProvider;
  isMultiProviderReady: boolean;
  multiProviderVersion: number;
  syncMultiProvider: (chainMetadata?: ProviderChainMetadata) => Promise<void>;
}

type ProviderChainMetadata = ReturnType<typeof useMetadataStore.getState>['chainMetadata'];

let providerSyncPromise: Promise<void> | null = null;
let queuedChainMetadata: ProviderChainMetadata | null = null;
let isProviderStoreSubscribed = false;

function syncMultiProviderSafely(chainMetadata?: ProviderChainMetadata) {
  useProviderStore
    .getState()
    .syncMultiProvider(chainMetadata)
    .catch((error) => logger.error('Error syncing MultiProtocolProvider', error));
}

const useProviderStore = create<ProviderState>()((set) => ({
  multiProvider: createEmptyMultiProvider(),
  isMultiProviderReady: false,
  multiProviderVersion: 0,
  syncMultiProvider: async (requestedChainMetadata) => {
    let chainMetadata = requestedChainMetadata;
    if (!chainMetadata || !Object.keys(chainMetadata).length) {
      const metadataState = useMetadataStore.getState();
      if (
        !metadataState.isChainMetadataLoaded ||
        !Object.keys(metadataState.chainMetadata).length
      ) {
        await metadataState.ensureChainMetadata();
      }

      chainMetadata = useMetadataStore.getState().chainMetadata;
    }

    if (providerSyncPromise) {
      queuedChainMetadata = chainMetadata;
      return providerSyncPromise;
    }

    const hadReadyProvider =
      useProviderStore.getState().multiProvider.getKnownChainNames().length > 0;
    set({ isMultiProviderReady: false });
    providerSyncPromise = Promise.resolve()
      .then(async () => {
        logger.debug('Syncing MultiProtocolProvider from metadata store');
        const nextMultiProvider = await createRuntimeMultiProvider(chainMetadata);
        if (queuedChainMetadata && queuedChainMetadata !== chainMetadata) {
          logger.debug('Discarding stale MultiProtocolProvider rebuild');
          return;
        }
        set((state) => ({
          multiProvider: nextMultiProvider,
          isMultiProviderReady: true,
          multiProviderVersion: state.multiProviderVersion + 1,
        }));
      })
      .catch((error) => {
        // Preserve the last known-good provider readiness if a rebuild fails.
        if (hadReadyProvider) {
          set({ isMultiProviderReady: true });
        }
        throw error;
      })
      .finally(() => {
        const nextChainMetadata = queuedChainMetadata;
        queuedChainMetadata = null;
        providerSyncPromise = null;

        if (nextChainMetadata && nextChainMetadata !== chainMetadata) {
          syncMultiProviderSafely(nextChainMetadata);
        }
      });

    return providerSyncPromise;
  },
}));

function ensureProviderStoreSubscription() {
  if (isProviderStoreSubscribed) return;
  isProviderStoreSubscribed = true;

  syncMultiProviderSafely();
  useMetadataStore.subscribe((state, prevState) => {
    if (state.chainMetadata !== prevState.chainMetadata) {
      syncMultiProviderSafely(state.chainMetadata);
    }
  });
}

export function useMultiProvider() {
  ensureProviderStoreSubscription();
  return useProviderStore((s) => s.multiProvider);
}

export function useReadyMultiProvider() {
  const { multiProvider, isMultiProviderReady } = useProviderStore((s) => ({
    multiProvider: s.multiProvider,
    isMultiProviderReady: s.isMultiProviderReady,
  }));
  ensureProviderStoreSubscription();
  if (!isMultiProviderReady || !multiProvider.getKnownChainNames().length) return undefined;
  return multiProvider;
}

export function useMultiProviderVersion() {
  ensureProviderStoreSubscription();
  return useProviderStore((s) => s.multiProviderVersion);
}
