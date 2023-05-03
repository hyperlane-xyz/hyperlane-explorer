import { providers } from 'ethers';

import { ChainMetadata, ExplorerFamily } from '@hyperlane-xyz/sdk';

import { logAndThrow } from '../../utils/errors';
import { logger } from '../../utils/logger';
import { sleep } from '../../utils/timeout';

import { HyperlaneEtherscanProvider } from './HyperlaneEtherscanProvider';
import { HyperlaneJsonRpcProvider } from './HyperlaneJsonRpcProvider';
import { IProviderMethods, ProviderMethod } from './ProviderMethods';
import { ChainMetadataWithRpcConnectionInfo } from './types';

const PROVIDER_STAGGER_DELAY_MS = 1000; // 1 seconds
const PROVIDER_TIMEOUT_MARKER = '__PROVIDER_TIMEOUT__';

type HyperlaneProvider = HyperlaneEtherscanProvider | HyperlaneJsonRpcProvider;

export class HyperlaneSmartProvider extends providers.BaseProvider implements IProviderMethods {
  public readonly chainMetadata: ChainMetadataWithRpcConnectionInfo;
  // TODO also support blockscout here
  public readonly explorerProviders: HyperlaneEtherscanProvider[];
  public readonly rpcProviders: HyperlaneJsonRpcProvider[];
  public readonly supportedMethods: ProviderMethod[];
  public requestCount = 0;

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

    this.requestCount += 1;
    const reqId = this.requestCount;

    let pIndex = 0;
    const maxPIndex = supportedProviders.length - 1;
    const providerResultPromises: Promise<any>[] = [];
    // TODO consider implementing quorum and/or retry logic here similar to FallbackProvider/RetryProvider
    while (true) {
      if (pIndex <= maxPIndex) {
        // Trigger the next provider in line
        const provider = supportedProviders[pIndex];
        const providerUrl = provider.getBaseUrl();

        // Skip the explorer provider if it's currently in a cooldown period
        if (
          this.isExplorerProvider(provider) &&
          provider.getQueryWaitTime() > 0 &&
          pIndex < maxPIndex &&
          method !== ProviderMethod.GetLogs // never skip GetLogs
        ) {
          pIndex += 1;
          continue;
        }

        const resultPromise = performWithLogging(provider, providerUrl, method, params, reqId);
        providerResultPromises.push(resultPromise);
        const timeoutPromise = sleep(PROVIDER_STAGGER_DELAY_MS, PROVIDER_TIMEOUT_MARKER);
        const result = await Promise.any([resultPromise, timeoutPromise]);

        if (result === PROVIDER_TIMEOUT_MARKER) {
          logger.warn(
            `Slow response from provider using ${providerUrl}. Triggering next provider if available`,
          );
          pIndex += 1;
        } else {
          // Result looks good
          return result;
        }
      } else {
        // All providers already triggered, wait for one to complete
        const timeoutPromise = sleep(PROVIDER_STAGGER_DELAY_MS * 20, PROVIDER_TIMEOUT_MARKER);
        const result = await Promise.any([...providerResultPromises, timeoutPromise]);
        if (result === PROVIDER_TIMEOUT_MARKER) {
          logAndThrow(`All providers failed or timed out for method ${method}`, result);
        } else {
          return result;
        }
      }
    }
  }

  isExplorerProvider(p: HyperlaneProvider): p is HyperlaneEtherscanProvider {
    return this.explorerProviders.includes(p as any);
  }
}

function performWithLogging(
  provider: HyperlaneProvider,
  providerUrl: string,
  method: string,
  params: any,
  reqId: number,
): Promise<any> {
  try {
    logger.debug(`Provider using ${providerUrl} performing method ${method} for reqId ${reqId}`);
    return provider.perform(method, params, reqId);
  } catch (error) {
    logger.error(`Error performing ${method} on provider ${providerUrl} for reqId ${reqId}`, error);
    throw new Error(`Error performing ${method} with ${providerUrl} for reqId ${reqId}`);
  }
}

function chainMetadataToProviderNetwork(chainMetadata: ChainMetadata): providers.Network {
  return {
    name: chainMetadata.name,
    chainId: chainMetadata.chainId,
    ensAddress: chainMetadata.ensAddress,
  };
}
