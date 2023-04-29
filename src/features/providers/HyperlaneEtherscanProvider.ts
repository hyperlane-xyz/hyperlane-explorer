import { providers } from 'ethers';

import { ChainMetadata, objFilter } from '@hyperlane-xyz/sdk';

import { logger } from '../../utils/logger';
import { sleep } from '../../utils/timeout';

import { IProviderMethods, ProviderMethod, excludeMethods } from './ProviderMethods';

type ExplorerConfig = Exclude<ChainMetadata['blockExplorers'], undefined>[number];

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
