import { BigNumber, providers, utils } from 'ethers';

import { ChainMetadata, ExplorerFamily, objFilter } from '@hyperlane-xyz/sdk';

import { logger } from '../../utils/logger';
import { isBigNumberish } from '../../utils/number';
import { chunk } from '../../utils/string';
import { sleep } from '../../utils/timeout';
import { isNullish } from '../../utils/typeof';

const PROVIDER_STAGGER_DELAY_MS = 1000; // 1 seconds
const PROVIDER_TIMEOUT_MARKER = '__PROVIDER_TIMEOUT__';

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

  /**
   * This perform method will trigger any providers that support the method
   * one at a time in preferential order. If one is slow to respond, the next is triggered.
   */
  async perform(method: string, params: { [name: string]: any }): Promise<any> {
    const allProviders = [...this.explorerProviders, ...this.rpcProviders];
    if (!allProviders.length) throw new Error('No providers available');

    const supportedProviders = allProviders.filter((p) =>
      p.supportedMethods.includes(method as ProviderMethod),
    );
    if (!supportedProviders.length) throw new Error(`No providers available for method ${method}`);

    let index = 0;
    const maxIndex = supportedProviders.length - 1;
    const providerResultPromises: Promise<any>[] = [];
    // TODO consider implementing quorum and/or retry logic here similar to FallbackProvider/RetryProvider
    while (true) {
      if (index <= maxIndex) {
        // Trigger the next provider in line
        const provider = supportedProviders[index];
        const providerUrl = provider.getBaseUrl();
        const resultPromise = provider.perform(method, params);
        providerResultPromises.push(resultPromise);
        const timeoutPromise = sleep(PROVIDER_STAGGER_DELAY_MS, PROVIDER_TIMEOUT_MARKER);
        const result = await Promise.race([resultPromise, timeoutPromise]);

        if (isNullish(result)) {
          logger.error(
            `Nullish result from provider using ${providerUrl}. Triggering next available provider`,
          );
          index += 1;
        } else if (result === PROVIDER_TIMEOUT_MARKER) {
          logger.warn(
            `Slow response from provider using ${providerUrl}. Triggering next available provider`,
          );
          index += 1;
        } else {
          // Result looks good
          return result;
        }
      } else {
        // All providers already triggered, wait for one to complete
        const timeoutPromise = sleep(PROVIDER_STAGGER_DELAY_MS * 12, PROVIDER_TIMEOUT_MARKER);
        const result = await Promise.race([...providerResultPromises, timeoutPromise]);
        if (isNullish(result) || result === PROVIDER_TIMEOUT_MARKER) {
          throw new Error(`All providers failed or timed out for method ${method}`);
        } else {
          return result;
        }
      }
    }
  }
}

// Used for crude rate-limiting of explorer queries without API keys
const hostToLastQueried: Record<string, number> = {};
const ETHERSCAN_THROTTLE_TIME = 5200; // 5.2 seconds

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
      if (waitTime > 0) {
        logger.debug(`HyperlaneEtherscanProvider waiting ${waitTime}ms to avoid rate limit`);
        await sleep(waitTime);
      }
      const result = await super.fetch(module, params, post);
      return result;
    } finally {
      hostToLastQueried[hostname] = Date.now();
    }
  }

  async perform(method: string, params: any): Promise<any> {
    logger.debug('HyperlaneEtherscanProvider performing method:', method);
    if (!this.supportedMethods.includes(method as ProviderMethod))
      throw new Error(`Unsupported method ${method}`);
    return super.perform(method, params);
  }
}

const NUM_LOG_BLOCK_RANGES_TO_QUERY = 10;
const NUM_PARALLEL_LOG_QUERIES = 5;

export class HyperlaneJsonRpcProvider
  extends providers.StaticJsonRpcProvider
  implements IProviderMethods
{
  public readonly supportedMethods = AllProviderMethods;

  constructor(public readonly rpcConfig: RpcConfigWithConnectionInfo, network: providers.Network) {
    super(rpcConfig.connection ?? rpcConfig.http, network);
  }

  async perform(method: string, params: any): Promise<any> {
    logger.debug('HyperlaneJsonRpcProvider performing method:', method);
    if (method === ProviderMethod.GetLogs) {
      return this.performGetLogs(params);
    } else {
      return super.perform(method, params);
    }
  }

  async performGetLogs(params: { filter: providers.Filter }) {
    const deferToSuper = () => super.perform(ProviderMethod.GetLogs, params);

    const paginationOptions = this.rpcConfig.pagination;
    if (!paginationOptions || !params.filter) return deferToSuper();

    const { fromBlock, toBlock, address, topics } = params.filter;
    // TODO update when sdk is updated
    const { blocks: maxBlockRange, from: minBlockNumber } = paginationOptions;

    if (!maxBlockRange && isNullish(minBlockNumber)) return deferToSuper();

    const currentBlockNumber = await super.perform(ProviderMethod.GetBlockNumber, null);

    let endBlock: number;
    if (isNullish(toBlock) || toBlock === 'latest') {
      endBlock = currentBlockNumber;
    } else if (isBigNumberish(toBlock)) {
      endBlock = BigNumber.from(toBlock).toNumber();
    } else {
      return deferToSuper();
    }

    const minQueryable = maxBlockRange
      ? endBlock - maxBlockRange * NUM_LOG_BLOCK_RANGES_TO_QUERY + 1
      : 0;

    let startBlock: number;
    if (fromBlock === 'earliest') {
      startBlock = 0;
    } else if (isBigNumberish(fromBlock)) {
      startBlock = BigNumber.from(fromBlock).toNumber();
    } else if (isNullish(fromBlock)) {
      startBlock = Math.max(minQueryable, minBlockNumber ?? 0);
    } else {
      return deferToSuper();
    }

    if (startBlock >= endBlock)
      throw new Error(`Invalid range ${startBlock} - ${endBlock}: start >= end`);
    if (minBlockNumber && startBlock < minBlockNumber)
      throw new Error(`Invalid start ${startBlock}: below rpc minBlockNumber ${minBlockNumber}`);
    if (startBlock < minQueryable) {
      throw new Error(`Invalid range ${startBlock} - ${endBlock}: requires too many queries`);
    }

    const blockChunkRange = maxBlockRange || endBlock - startBlock;
    const blockChunks: [number, number][] = [];
    for (let from = startBlock; from <= endBlock; from += blockChunkRange) {
      const to = Math.min(from + blockChunkRange - 1, endBlock);
      blockChunks.push([from, to]);
    }

    let combinedResults: Array<providers.Log> = [];
    const requestChunks = chunk(blockChunks, NUM_PARALLEL_LOG_QUERIES);
    for (const reqChunk of requestChunks) {
      const resultPromises = reqChunk.map(
        (blockChunk) =>
          super.perform(ProviderMethod.GetLogs, {
            filter: {
              address,
              topics,
              fromBlock: BigNumber.from(blockChunk[0]).toHexString(),
              toBlock: BigNumber.from(blockChunk[1]).toHexString(),
            },
          }) as Promise<Array<providers.Log>>,
      );
      const results = await Promise.all(resultPromises);
      combinedResults = [...combinedResults, ...results.flat()];
    }

    return combinedResults;
  }

  getBaseUrl(): string {
    return this.connection.url;
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
