import { providers, utils } from 'ethers';

import { ChainMetadata, ExplorerFamily } from '@hyperlane-xyz/sdk';

type RpcConfigWithConnectionInfo = ChainMetadata['publicRpcUrls'][number] & {
  connection?: utils.ConnectionInfo;
};

interface ChainMetadataWithRpcConnectionInfo extends ChainMetadata {
  publicRpcUrls: RpcConfigWithConnectionInfo[];
}

export class HyperlaneSmartProvider extends providers.BaseProvider {
  public readonly chainMetadata: ChainMetadataWithRpcConnectionInfo;
  // TODO also support blockscout here
  public readonly explorerProviders: HyperlaneEtherscanProvider[];
  public readonly rpcProviders: providers.StaticJsonRpcProvider[];

  constructor(chainMetadata: ChainMetadataWithRpcConnectionInfo) {
    const network = chainMetadataToProviderNetwork(chainMetadata);
    super(network);
    this.chainMetadata = chainMetadata;

    if (chainMetadata.blockExplorers?.length) {
      this.explorerProviders = chainMetadata.blockExplorers
        .map((explorerConfig) => {
          if (!explorerConfig.family || explorerConfig.family === ExplorerFamily.Etherscan)
            return new HyperlaneEtherscanProvider(network, explorerConfig);
          // TODO also support blockscout here
          else return null;
        })
        .filter((e): e is HyperlaneEtherscanProvider => !!e);
    } else {
      this.explorerProviders = [];
    }

    if (chainMetadata.publicRpcUrls?.length) {
      this.rpcProviders = chainMetadata.publicRpcUrls.map(
        (rpcConfig) =>
          new providers.StaticJsonRpcProvider(rpcConfig.connection ?? rpcConfig.http, network),
      );
    } else {
      this.rpcProviders = [];
    }
  }

  async detectNetwork(): Promise<providers.Network> {
    // For simplicity, efficiency, and better compat with new network, this SmartProvider
    // assumes the provided RPC urls are correct and returns static data here instead of
    // querying each for network info
    return chainMetadataToProviderNetwork(this.chainMetadata);
  }

  async perform(method: string, params: { [name: string]: any }): Promise<any> {
    //TODO
  }
}

type ExplorerConfig = Exclude<ChainMetadata['blockExplorers'], undefined>[number];

export class HyperlaneEtherscanProvider extends providers.EtherscanProvider {
  public readonly explorerConfig: ExplorerConfig;

  constructor(network: providers.Network, explorerConfig: ExplorerConfig) {
    super(network);
    this.explorerConfig = explorerConfig;
    utils.defineReadOnly(this, 'baseUrl', this.getBaseUrl());
  }

  getBaseUrl(): string {
    if (!this.explorerConfig?.apiUrl) return '';
    return this.explorerConfig.apiUrl;
  }
}

function chainMetadataToProviderNetwork(chainMetadata: ChainMetadata): providers.Network {
  return {
    name: chainMetadata.name,
    chainId: chainMetadata.chainId,
    // @ts-ignore TODO remove when SDK updated
    ensAddress: chainMetadata.ensAddress,
  };
}
