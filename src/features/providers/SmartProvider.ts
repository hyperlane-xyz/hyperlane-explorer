import { providers } from 'ethers';

import { ChainMetadata, ExplorerFamily } from '@ortege/sdk';

import { logger } from '../../utils/logger';
import { timeout } from '../../utils/timeout';

import { HyperlaneEtherscanProvider } from './HyperlaneEtherscanProvider';
import { HyperlaneJsonRpcProvider } from './HyperlaneJsonRpcProvider';
import { IProviderMethods, ProviderMethod } from './ProviderMethods';
import {
    ChainMetadataWithRpcConnectionInfo,
    ProviderPerformResult,
    ProviderStatus,
    ProviderTimeoutResult,
} from './types';

const PROVIDER_STAGGER_DELAY_MS = 1000; // 1 seconds

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
    const providerResultPromises: Promise<ProviderPerformResult>[] = [];
    const providerResultErrors: unknown[] = [];
    // TODO consider implementing quorum and/or retry logic here similar to FallbackProvider/RetryProvider
    while (true) {
      if (pIndex <= maxPIndex) {
        // Trigger the next provider in line
        const provider = supportedProviders[pIndex];
        const providerUrl = provider.getBaseUrl();
        const isLastProvider = pIndex === maxPIndex;

        // Skip the explorer provider if it's currently in a cooldown period
        if (
          this.isExplorerProvider(provider) &&
          provider.getQueryWaitTime() > 0 &&
          !isLastProvider &&
          method !== ProviderMethod.GetLogs // never skip GetLogs
        ) {
          pIndex += 1;
          continue;
        }

        const resultPromise = wrapProviderPerform(provider, providerUrl, method, params, reqId);
        const timeoutPromise = timeout<ProviderTimeoutResult>(PROVIDER_STAGGER_DELAY_MS, {
          status: ProviderStatus.Timeout,
        });
        const result = await Promise.race([resultPromise, timeoutPromise]);

        if (result.status === ProviderStatus.Success) {
          return result.value;
        } else if (result.status === ProviderStatus.Timeout) {
          logger.warn(
            `Slow response from provider using ${providerUrl}.${
              !isLastProvider ? ' Triggering next provider.' : ''
            }`,
          );
          providerResultPromises.push(resultPromise);
          pIndex += 1;
        } else if (result.status === ProviderStatus.Error) {
          logger.warn(
            `Error from provider using ${providerUrl}.${
              !isLastProvider ? ' Triggering next provider.' : ''
            }`,
          );
          providerResultErrors.push(result.error);
          pIndex += 1;
        } else {
          throw new Error('Unexpected result from provider');
        }
      } else if (providerResultPromises.length > 0) {
        // All providers already triggered, wait for one to complete or all to fail/timeout
        const timeoutPromise = timeout<ProviderTimeoutResult>(PROVIDER_STAGGER_DELAY_MS * 20, {
          status: ProviderStatus.Timeout,
        });
        const resultPromise = waitForProviderSuccess(providerResultPromises);
        const result = await Promise.race([resultPromise, timeoutPromise]);

        if (result.status === ProviderStatus.Success) {
          return result.value;
        } else if (result.status === ProviderStatus.Timeout) {
          throwCombinedProviderErrors(
            providerResultErrors,
            `All providers timed out for method ${method}`,
          );
        } else if (result.status === ProviderStatus.Error) {
          throwCombinedProviderErrors(
            [result.error, ...providerResultErrors],
            `All providers failed for method ${method}`,
          );
        } else {
          throw new Error('Unexpected result from provider');
        }
      } else {
        // All providers have already failed, all hope is lost
        throwCombinedProviderErrors(
          providerResultErrors,
          `All providers failed for method ${method}`,
        );
      }
    }
  }

  isExplorerProvider(p: HyperlaneProvider): p is HyperlaneEtherscanProvider {
    return this.explorerProviders.includes(p as any);
  }
}

// Warp for additional logging and error handling
async function wrapProviderPerform(
  provider: HyperlaneProvider,
  providerUrl: string,
  method: string,
  params: any,
  reqId: number,
): Promise<ProviderPerformResult> {
  try {
    logger.debug(`Provider using ${providerUrl} performing method ${method} for reqId ${reqId}`);
    const result = await provider.perform(method, params, reqId);
    return { status: ProviderStatus.Success, value: result };
  } catch (error) {
    logger.error(`Error performing ${method} on provider ${providerUrl} for reqId ${reqId}`, error);
    return { status: ProviderStatus.Error, error };
  }
}

async function waitForProviderSuccess(
  _resultPromises: Promise<ProviderPerformResult>[],
): Promise<ProviderPerformResult> {
  // A hack to remove the promise from the array when it resolves
  const resolvedPromiseIndexes = new Set<number>();
  const resultPromises = _resultPromises.map((p, i) =>
    p.then((r) => {
      resolvedPromiseIndexes.add(i);
      return r;
    }),
  );
  const combinedErrors: unknown[] = [];
  for (let i = 0; i < resultPromises.length; i += 1) {
    const promises = resultPromises.filter((_, i) => !resolvedPromiseIndexes.has(i));
    const result = await Promise.race(promises);
    if (result.status === ProviderStatus.Success) {
      return result;
    } else if (result.status === ProviderStatus.Error) {
      combinedErrors.push(result.error);
    } else {
      return { status: ProviderStatus.Error, error: new Error('Unexpected result from provider') };
    }
  }
  return {
    status: ProviderStatus.Error,
    // TODO combine errors
    error: combinedErrors.length ? combinedErrors[0] : new Error('Unknown error from provider'),
  };
}

function throwCombinedProviderErrors(errors: unknown[], fallbackMsg: string): void {
  logger.error(fallbackMsg);
  // TODO inspect the errors in some clever way to choose which to throw
  if (errors.length > 0) throw errors[0];
  else throw new Error(fallbackMsg);
}

function chainMetadataToProviderNetwork(chainMetadata: ChainMetadata): providers.Network {
  return {
    name: chainMetadata.name,
    chainId: chainMetadata.chainId,
    ensAddress: chainMetadata.ensAddress,
  };
}
