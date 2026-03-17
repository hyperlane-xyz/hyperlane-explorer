import { MultiProtocolProvider } from '@hyperlane-xyz/sdk';
import { create } from 'zustand';

import { useStore as useMetadataStore } from './metadataStore';
import { logger } from './utils/logger';

export {
  useChainMetadata,
  useRegistry,
  useStore,
  useWarpRouteIdToAddressesMap,
} from './metadataStore';

interface ProviderState {
  multiProvider: MultiProtocolProvider;
  syncMultiProvider: () => Promise<void>;
}

let providerSyncPromise: Promise<void> | null = null;
let isProviderStoreSubscribed = false;

const useProviderStore = create<ProviderState>()((set) => ({
  multiProvider: new MultiProtocolProvider({}),
  syncMultiProvider: async () => {
    if (providerSyncPromise) return providerSyncPromise;

    providerSyncPromise = (async () => {
      const metadataState = useMetadataStore.getState();
      if (
        !metadataState.isChainMetadataLoaded ||
        !Object.keys(metadataState.chainMetadata).length
      ) {
        await metadataState.ensureChainMetadata();
      }

      const { chainMetadata } = useMetadataStore.getState();
      logger.debug('Syncing MultiProtocolProvider from metadata store');
      set({ multiProvider: new MultiProtocolProvider(chainMetadata) });
    })().finally(() => {
      providerSyncPromise = null;
    });

    return providerSyncPromise;
  },
}));

function ensureProviderStoreSubscription() {
  if (isProviderStoreSubscribed) return;
  isProviderStoreSubscribed = true;

  void useProviderStore.getState().syncMultiProvider();
  useMetadataStore.subscribe((state, prevState) => {
    if (state.chainMetadata !== prevState.chainMetadata) {
      void useProviderStore.getState().syncMultiProvider();
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
