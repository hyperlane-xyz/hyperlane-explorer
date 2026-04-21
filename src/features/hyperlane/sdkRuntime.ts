import type { ChainMetadata } from '@hyperlane-xyz/sdk/metadata/chainMetadataTypes';
import { MultiProviderAdapter } from '@hyperlane-xyz/sdk/providers/MultiProviderAdapter';
import type { ChainMap } from '@hyperlane-xyz/sdk/types';

export type ExplorerMultiProvider = MultiProviderAdapter<{ mailbox?: string }>;

export function createEmptyMultiProvider(): ExplorerMultiProvider {
  return new MultiProviderAdapter({}, { providerBuilders: {} });
}

// Explorer's provider-backed runtime paths are EVM-like today:
// PI search, delivery status, debugger, ICA, rebalances, and warp balance reads.
// Keeping this helper on the narrow EVM-like runtime surface preserves Tron parity
// without pulling every VM builder into the build graph.
export async function createRuntimeMultiProvider(
  chainMetadata: ChainMap<ChainMetadata<{ mailbox?: string }>>,
): Promise<ExplorerMultiProvider> {
  const { evmLikeRuntimeProviderBuilders } =
    await import('@hyperlane-xyz/sdk/providers/runtime/evmLike');
  return new MultiProviderAdapter(chainMetadata, {
    providerBuilders: evmLikeRuntimeProviderBuilders,
  });
}
