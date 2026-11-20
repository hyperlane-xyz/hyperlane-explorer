import {
  ChainTechnicalStack,
  type ChainMetadata,
} from '@hyperlane-xyz/sdk/metadata/chainMetadataTypes';
import { MinimalProviderRegistry } from '@hyperlane-xyz/sdk/providers/MinimalProviderRegistry';
import type { MultiProviderAdapter } from '@hyperlane-xyz/sdk/providers/MultiProviderAdapter';
import { ProviderType } from '@hyperlane-xyz/sdk/providers/ProviderType';
import type { HypTokenAdapterInput } from '@hyperlane-xyz/sdk/token/adapters/hypTokenAdapterUtils';
import type { ChainMap, ChainNameOrId } from '@hyperlane-xyz/sdk/types';
import { ProtocolType } from '@hyperlane-xyz/utils';

export class ExplorerMultiProvider extends MinimalProviderRegistry<{ mailbox?: string }> {
  private tokenAdapterProvider?: MultiProviderAdapter<{ mailbox?: string }>;

  override tryGetProvider(chainNameOrId: ChainNameOrId, type?: ProviderType) {
    const metadata = type === undefined ? this.tryGetChainMetadata(chainNameOrId) : undefined;
    const isZkSync =
      metadata?.protocol === ProtocolType.Ethereum &&
      metadata.technicalStack === ChainTechnicalStack.ZkSync;
    return super.tryGetProvider(
      chainNameOrId,
      type ?? (isZkSync ? ProviderType.ZkSync : undefined),
    );
  }

  async createEvmTokenAdapter(token: HypTokenAdapterInput) {
    const [{ createEvmHypAdapter }, { MultiProviderAdapter }] = await Promise.all([
      import('@hyperlane-xyz/sdk/token/adapters/evmHyp'),
      import('@hyperlane-xyz/sdk/providers/MultiProviderAdapter'),
    ]);
    this.tokenAdapterProvider ??= new MultiProviderAdapter(this.metadata, {
      ...this.options,
      providers: this.providers,
    });
    return createEvmHypAdapter(this.tokenAdapterProvider, token);
  }
}

export function createEmptyMultiProvider(): ExplorerMultiProvider {
  return new ExplorerMultiProvider({}, { providerBuilders: {} });
}

// Explorer's provider-backed runtime paths are EVM-like today:
// PI search, delivery status, debugger, ICA, and warp balance reads.
// Keeping this helper on the narrow EVM-like runtime surface preserves Tron parity
// without pulling every VM builder into the build graph.
export async function createRuntimeMultiProvider(
  chainMetadata: ChainMap<ChainMetadata<{ mailbox?: string }>>,
): Promise<ExplorerMultiProvider> {
  const { evmLikeRuntimeProviderBuilders } =
    await import('@hyperlane-xyz/sdk/providers/runtime/evmLike');
  return new ExplorerMultiProvider(chainMetadata, {
    providerBuilders: evmLikeRuntimeProviderBuilders,
  });
}
