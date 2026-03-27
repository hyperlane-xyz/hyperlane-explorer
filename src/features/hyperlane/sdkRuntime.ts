import type { ChainMetadata } from '@hyperlane-xyz/sdk/metadata/chainMetadataTypes';
import { MultiProviderAdapter } from '@hyperlane-xyz/sdk/providers/MultiProviderAdapter';
import type { ChainMap } from '@hyperlane-xyz/sdk/types';

export type ExplorerMultiProvider = MultiProviderAdapter<{ mailbox?: string }>;

export function createEmptyMultiProvider(): ExplorerMultiProvider {
  return new MultiProviderAdapter({}, { providerBuilders: {} });
}

// Explorer's provider-backed runtime paths are EVM-only today:
// PI search, delivery status, debugger, ICA, rebalances, and warp balance reads.
// Keeping this helper Ethereum-only avoids pulling every VM builder into the build graph.
export async function createRuntimeMultiProvider(
  chainMetadata: ChainMap<ChainMetadata<{ mailbox?: string }>>,
): Promise<ExplorerMultiProvider> {
  const { evmRuntimeProviderBuilders } = await import('@hyperlane-xyz/sdk/providers/runtime/evm');
  return new MultiProviderAdapter(chainMetadata, {
    providerBuilders: evmRuntimeProviderBuilders,
  });
}
