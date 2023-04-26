import { providers, utils } from 'ethers';

import { ChainMetadata, ExplorerFamily, objFilter } from '@hyperlane-xyz/sdk';

import { logger } from '../../utils/logger';
import { sleep } from '../../utils/timeout';

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
    // TODO trigger next provider if current one takes too long
    // This will help spread load across providers and ease rate limiting
    for (const provider of supportedProviders) {
      const providerUrl =
        provider instanceof providers.JsonRpcProvider ? provider.connection.url : provider.baseUrl;
      try {
        const result = await provider.perform(method, params);
        if (result === null || result === undefined) {
          throw new Error(`Nullish result from provider using url: ${providerUrl}`);
        }
        return result;
      } catch (error) {
        logger.error('Error from provider using url:', providerUrl, error);
      }
    }

    throw new Error(`All providers failed for method ${method}`);
  }
}

// Used for crude rate-limiting of explorer queries without API keys
const hostToLastQueried: Record<string, number> = {};
const ETHERSCAN_THROTTLE_TIME = 5100; // 5.1 seconds

export class HyperlaneEtherscanProvider
  extends providers.EtherscanProvider
  implements IProviderMethods
{
  // Seeing problems with these two methods even though etherscan api claims to support them
  public readonly supportedMethods = excludeMethods([
    ProviderMethod.Call,
    ProviderMethod.EstimateGas,
    ProviderMethod.SendTransaction,
  ]);

  constructor(public readonly explorerConfig: ExplorerConfig, network: providers.Network) {
    super(network, explorerConfig.apiKey);
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

  getHostname(): string {
    return new URL(this.getBaseUrl()).hostname;
  }

  async fetch(module: string, params: Record<string, any>, post?: boolean): Promise<any> {
    if (!this.isCommunityResource()) return super.fetch(module, params, post);
    const hostname = this.getHostname();
    try {
      const lastExplorerQuery = hostToLastQueried[hostname] || 0;
      const waitTime = ETHERSCAN_THROTTLE_TIME - (Date.now() - lastExplorerQuery);
      if (waitTime > 0) await sleep(waitTime);
      const result = await super.fetch(module, params, post);
      return result;
    } finally {
      hostToLastQueried[hostname] = Date.now();
    }
  }

  async perform(method: string, params: any): Promise<any> {
    if (!this.supportedMethods.includes(method as ProviderMethod))
      throw new Error(`Unsupported method ${method}`);
    return super.perform(method, params);
  }
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

function excludeMethods(exclude: ProviderMethod[]): ProviderMethod[] {
  return AllProviderMethods.filter((m) => !exclude.includes(m));
}
