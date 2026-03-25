import type { ChainMetadata } from '@hyperlane-xyz/sdk/metadata/chainMetadataTypes';
import {
  ConfiguredMultiProtocolProvider,
  type ConfiguredMultiProtocolProvider as ConfiguredProviderType,
} from '@hyperlane-xyz/sdk/providers/ConfiguredMultiProtocolProvider';
import type { ProviderBuilderMap } from '@hyperlane-xyz/sdk/providers/providerBuilders';
import { ProviderType } from '@hyperlane-xyz/sdk/providers/ProviderType';
import type { ChainMap } from '@hyperlane-xyz/sdk/types';

export type ExplorerMultiProvider = ConfiguredProviderType<{ mailbox?: string }>;

export function createEmptyMultiProvider(): ExplorerMultiProvider {
  return new ConfiguredMultiProtocolProvider({}, { providerBuilders: {} });
}

// Explorer's provider-backed runtime paths are EVM-only today:
// PI search, delivery status, debugger, ICA, rebalances, and warp balance reads.
// Keeping this helper Ethereum-only avoids pulling every VM builder into the build graph.
export async function createRuntimeMultiProvider(
  chainMetadata: ChainMap<ChainMetadata<{ mailbox?: string }>>,
): Promise<ExplorerMultiProvider> {
  const [{ defaultEthersV5ProviderBuilder }, { defaultViemProviderBuilder }] = await Promise.all([
    import('@hyperlane-xyz/sdk/providers/builders/ethersV5'),
    import('@hyperlane-xyz/sdk/providers/builders/viem'),
  ]);

  const providerBuilders: Partial<ProviderBuilderMap> = {
    [ProviderType.EthersV5]: defaultEthersV5ProviderBuilder,
    [ProviderType.Viem]: defaultViemProviderBuilder,
  };

  return new ConfiguredMultiProtocolProvider(chainMetadata, { providerBuilders });
}
