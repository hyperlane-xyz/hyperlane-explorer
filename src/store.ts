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

    providerSyncPromise = Promise.resolve()
      .then(async () => {
        logger.debug('Syncing MultiProtocolProvider from metadata store');
        set({ multiProvider: await createRuntimeMultiProvider(chainMetadata) });
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
      useProviderStore.setState({ multiProvider: createEmptyMultiProvider() });
      syncMultiProviderSafely(state.chainMetadata);
    }
  });
}

export function useMultiProvider() {
  ensureProviderStoreSubscription();
  return useProviderStore((s) => s.multiProvider);
}

export function useReadyMultiProvider() {
  const multiProvider = useMultiProvider();
  if (!multiProvider.getKnownChainNames().length) return undefined;
  return multiProvider;
}
