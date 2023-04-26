import { providers, utils } from 'ethers';

import { ChainMetadata, ExplorerFamily, objFilter } from '@hyperlane-xyz/sdk';

import { logger } from '../../utils/logger';

type RpcConfigWithConnectionInfo = ChainMetadata['publicRpcUrls'][number] & {
  connection?: utils.ConnectionInfo;
};

type ExplorerConfig = Exclude<ChainMetadata['blockExplorers'], undefined>[number];

interface ChainMetadataWithRpcConnectionInfo extends ChainMetadata {
  publicRpcUrls: RpcConfigWithConnectionInfo[];
}

export enum ProviderMethod {
  Call = 'call',
  EstimateGas = 'estimateGas',
  GetBalance = 'getBalance',
  GetBlock = 'getBlock',
  GetBlockNumber = 'getBlockNumber',
  GetCode = 'getCode',
  GetGasPrice = 'getGasPrice',
  GetStorageAt = 'getStorageAt',
  GetTransaction = 'getTransaction',
  GetTransactionCount = 'getTransactionCount',
  GetTransactionReceipt = 'getTransactionReceipt',
  GetLogs = 'getLogs',
  SendTransaction = 'sendTransaction',
}

const AllProviderMethods = Object.values(ProviderMethod);

interface IProviderMethods {
  readonly supportedMethods: ProviderMethod[];
}

export class HyperlaneSmartProvider extends providers.BaseProvider implements IProviderMethods {
  public readonly chainMetadata: ChainMetadataWithRpcConnectionInfo;
  // TODO also support blockscout here
  public readonly explorerProviders: HyperlaneEtherscanProvider[];
  public readonly rpcProviders: HyperlaneJsonRpcProvider[];
  public readonly supportedMethods: ProviderMethod[];

  constructor(chainMetadata: ChainMetadataWithRpcConnectionInfo) {
    const network = chainMetadataToProviderNetwork(chainMetadata);
    super(network);
    this.chainMetadata = chainMetadata;
    const supportedMethods = new Set<ProviderMethod>();

    if (chainMetadata.blockExplorers?.length) {
      this.explorerProviders = chainMetadata.blockExplorers
        .map((explorerConfig) => {
          if (!explorerConfig.family || explorerConfig.family === ExplorerFamily.Etherscan) {
            const newProvider = new HyperlaneEtherscanProvider(explorerConfig, network);
            newProvider.supportedMethods.forEach((m) => supportedMethods.add(m));
            return newProvider;
            // TODO also support blockscout here
          } else return null;
        })
        .filter((e): e is HyperlaneEtherscanProvider => !!e);
    } else {
      this.explorerProviders = [];
    }

    if (chainMetadata.publicRpcUrls?.length) {
      this.rpcProviders = chainMetadata.publicRpcUrls.map((rpcConfig) => {
        const newProvider = new HyperlaneJsonRpcProvider(rpcConfig, network);
        newProvider.supportedMethods.forEach((m) => supportedMethods.add(m));
        return newProvider;
      });
    } else {
      this.rpcProviders = [];
    }

    this.supportedMethods = [...supportedMethods.values()];
  }

  async detectNetwork(): Promise<providers.Network> {
    // For simplicity, efficiency, and better compat with new networks, this assumes
    // the provided RPC urls are correct and returns static data here instead of
    // querying each sub-provider for network info
    return chainMetadataToProviderNetwork(this.chainMetadata);
  }

  async perform(method: string, params: { [name: string]: any }): Promise<any> {
    const allProviders = [...this.explorerProviders, ...this.rpcProviders];
    if (!allProviders.length) throw new Error('No providers available');
    if (!this.supportedMethods.includes(method as ProviderMethod))
      throw new Error(`No providers available for method ${method}`);

    const supportedProviders = allProviders.filter((p) =>
      p.supportedMethods.includes(method as ProviderMethod),
    );

    // TODO consider implementing quorum and/or retry logic here similar to FallbackProvider/RetryProvider
    for (const provider of supportedProviders) {
      const providerUrl =
        provider instanceof providers.JsonRpcProvider ? provider.connection.url : provider.baseUrl;
      try {
        const result = await provider.perform(method, params);
        if (result === null || result === undefined) {
          logger.error('Nullish result from provider using url:', providerUrl);
        }
        return result;
      } catch (error) {
        logger.error('Error from provider using url:', providerUrl, error);
      }
    }

    throw new Error(`All providers failed for method ${method}`);
  }
}

export class HyperlaneEtherscanProvider
  extends providers.EtherscanProvider
  implements IProviderMethods
{
  public readonly supportedMethods: ProviderMethod[];

  constructor(public readonly explorerConfig: ExplorerConfig, network: providers.Network) {
    super(network, explorerConfig.apiKey);
    const unsupportedMethods: ProviderMethod[] = [ProviderMethod.SendTransaction];
    this.supportedMethods = AllProviderMethods.filter((m) => !unsupportedMethods.includes(m));
  }

  getBaseUrl(): string {
    if (!this.explorerConfig) return ''; // Constructor net yet finished
    const apiUrl = this.explorerConfig?.apiUrl;
    if (!apiUrl) throw new Error('Explorer config missing apiUrl');
    if (apiUrl.endsWith('/api')) return apiUrl.slice(0, -4);
    return apiUrl;
  }

  getUrl(module: string, params: Record<string, string>): string {
    const combinedParams = objFilter(params, (k, v): v is string => !!k && !!v);
    combinedParams['module'] = module;
    if (this.apiKey) combinedParams['apikey'] = this.apiKey;
    const parsedParams = new URLSearchParams(combinedParams);
    return `${this.getBaseUrl()}/api?${parsedParams.toString()}`;
  }

  getPostUrl(): string {
    return `${this.getBaseUrl()}/api`;
  }

  async fetch(module: string, params: Record<string, any>, post?: boolean): Promise<any> {
    // TODO wrap this in intelligent rate limiting based on this.isCommunityResource
    return super.fetch(module, params, post);
  }
  //TODO fix bug with getTxCount method
}

export class HyperlaneJsonRpcProvider
  extends providers.StaticJsonRpcProvider
  implements IProviderMethods
{
  public readonly supportedMethods = AllProviderMethods;

  constructor(rpcConfig: RpcConfigWithConnectionInfo, network: providers.Network) {
    super(rpcConfig.connection ?? rpcConfig.http, network);
  }

  send(method: string, params: Array<any>): Promise<any> {
    // TODO implement smart chunking here based on rpcConfig values
    return super.send(method, params);
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
