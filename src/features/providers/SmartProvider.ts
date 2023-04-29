import { providers } from 'ethers';

import { ChainMetadata, ExplorerFamily } from '@hyperlane-xyz/sdk';

import { logger } from '../../utils/logger';
import { sleep } from '../../utils/timeout';
import { isNullish } from '../../utils/typeof';

import { HyperlaneEtherscanProvider } from './HyperlaneEtherscanProvider';
import { HyperlaneJsonRpcProvider } from './HyperlaneJsonRpcProvider';
import { IProviderMethods, ProviderMethod } from './ProviderMethods';
import { ChainMetadataWithRpcConnectionInfo } from './types';

const PROVIDER_STAGGER_DELAY_MS = 1000; // 1 seconds
const PROVIDER_TIMEOUT_MARKER = '__PROVIDER_TIMEOUT__';

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
function chainMetadataToProviderNetwork(chainMetadata: ChainMetadata): providers.Network {
  return {
    name: chainMetadata.name,
    chainId: chainMetadata.chainId,
    // @ts-ignore TODO remove when SDK updated
    ensAddress: chainMetadata.ensAddress,
  };
}
