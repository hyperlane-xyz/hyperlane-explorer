import type { ChainMetadata } from '@hyperlane-xyz/sdk/metadata/chainMetadataTypes';
import {
  ConfiguredMultiProtocolProvider,
  type ConfiguredMultiProtocolProvider as ConfiguredProviderType,
} from '@hyperlane-xyz/sdk/providers/ConfiguredMultiProtocolProvider';
import type {
  ProviderBuilderFn,
  ProviderBuilderMap,
} from '@hyperlane-xyz/sdk/providers/providerBuilders';
import type { TypedProvider } from '@hyperlane-xyz/sdk/providers/ProviderType';
import { ProviderType } from '@hyperlane-xyz/sdk/providers/ProviderType';
import type { ChainMap } from '@hyperlane-xyz/sdk/types';
import { type KnownProtocolType, ProtocolType } from '@hyperlane-xyz/utils';

export type ExplorerMultiProvider = ConfiguredProviderType<{ mailbox?: string }>;

export function createEmptyMultiProvider(): ExplorerMultiProvider {
  return new ConfiguredMultiProtocolProvider({}, { providerBuilders: {} });
}

export async function createRuntimeMultiProvider(
  chainMetadata: ChainMap<ChainMetadata<{ mailbox?: string }>>,
): Promise<ExplorerMultiProvider> {
  const protocols = getProtocols(chainMetadata);
  const providerBuilders = await getProviderBuilders(protocols);

  const defaultTronEthersProviderBuilder = protocols.includes(ProtocolType.Tron)
    ? (await import('@hyperlane-xyz/sdk/providers/builders/tron')).defaultTronEthersProviderBuilder
    : undefined;

  class RuntimeConfiguredMultiProtocolProvider<
    MetaExt extends object = object,
  > extends ConfiguredMultiProtocolProvider<MetaExt> {
    protected override getProviderBuilder(
      protocol: ProtocolType,
      type: ProviderType,
    ): ProviderBuilderFn<TypedProvider> | undefined {
      if (
        protocol === ProtocolType.Tron &&
        type === ProviderType.EthersV5 &&
        defaultTronEthersProviderBuilder
      ) {
        return (urls, network) => ({
          type: ProviderType.EthersV5,
          provider: defaultTronEthersProviderBuilder(urls, network),
        });
      }

      return this.providerBuilders[type];
    }
  }

  return new RuntimeConfiguredMultiProtocolProvider(chainMetadata, { providerBuilders });
}

function getProtocols(
  chainMetadata: ChainMap<ChainMetadata<{ mailbox?: string }>>,
): KnownProtocolType[] {
  return [...new Set(Object.values(chainMetadata).map((metadata) => metadata.protocol))] as
    KnownProtocolType[];
}

async function getProviderBuilders(
  protocols: KnownProtocolType[],
): Promise<Partial<ProviderBuilderMap>> {
  const uniqueProtocols = new Set(protocols);
  const providerBuilders: Partial<ProviderBuilderMap> = {};

  if (uniqueProtocols.has(ProtocolType.Ethereum)) {
    const [{ defaultEthersV5ProviderBuilder }, { defaultViemProviderBuilder }] = await Promise.all([
      import('@hyperlane-xyz/sdk/providers/builders/ethersV5'),
      import('@hyperlane-xyz/sdk/providers/builders/viem'),
    ]);
    providerBuilders[ProviderType.EthersV5] = defaultEthersV5ProviderBuilder;
    providerBuilders[ProviderType.Viem] = defaultViemProviderBuilder;
  }

  if (uniqueProtocols.has(ProtocolType.Cosmos) || uniqueProtocols.has(ProtocolType.CosmosNative)) {
    const {
      defaultCosmJsNativeProviderBuilder,
      defaultCosmJsProviderBuilder,
      defaultCosmJsWasmProviderBuilder,
    } = await import('@hyperlane-xyz/sdk/providers/builders/cosmos');
    providerBuilders[ProviderType.CosmJs] = defaultCosmJsProviderBuilder;
    providerBuilders[ProviderType.CosmJsWasm] = defaultCosmJsWasmProviderBuilder;
    providerBuilders[ProviderType.CosmJsNative] = defaultCosmJsNativeProviderBuilder;
  }

  if (uniqueProtocols.has(ProtocolType.Sealevel)) {
    const { defaultSolProviderBuilder } =
      await import('@hyperlane-xyz/sdk/providers/builders/solana');
    providerBuilders[ProviderType.SolanaWeb3] = defaultSolProviderBuilder;
  }

  if (uniqueProtocols.has(ProtocolType.Starknet)) {
    const { defaultStarknetJsProviderBuilder } =
      await import('@hyperlane-xyz/sdk/providers/builders/starknet');
    providerBuilders[ProviderType.Starknet] = defaultStarknetJsProviderBuilder;
  }

  if (uniqueProtocols.has(ProtocolType.Radix)) {
    const { defaultRadixProviderBuilder } =
      await import('@hyperlane-xyz/sdk/providers/builders/radix');
    providerBuilders[ProviderType.Radix] = defaultRadixProviderBuilder;
  }

  if (uniqueProtocols.has(ProtocolType.Aleo)) {
    const { defaultAleoProviderBuilder } =
      await import('@hyperlane-xyz/sdk/providers/builders/aleo');
    providerBuilders[ProviderType.Aleo] = defaultAleoProviderBuilder;
  }

  if (uniqueProtocols.has(ProtocolType.Tron)) {
    const { defaultTronProviderBuilder } =
      await import('@hyperlane-xyz/sdk/providers/builders/tron');
    providerBuilders[ProviderType.Tron] = defaultTronProviderBuilder;
  }

  return providerBuilders;
}
