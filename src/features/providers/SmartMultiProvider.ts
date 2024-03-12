import {
  ChainMap,
  ChainMetadata,
  ChainName,
  HyperlaneSmartProvider,
  MultiProvider,
  chainMetadata,
} from '@hyperlane-xyz/sdk';

import { logger } from '../../utils/logger';
import type { ChainConfig } from '../chains/chainConfig';

export class SmartMultiProvider extends MultiProvider {
  constructor(chainMetadata?: ChainMap<ChainMetadata>, options?: any) {
    super(chainMetadata, options);
  }
  // Override to use SmartProvider instead of FallbackProvider
  override tryGetProvider(chainNameOrId: ChainName | number): HyperlaneSmartProvider | null {
    const metadata = this.tryGetChainMetadata(chainNameOrId);
    if (!metadata) return null;
    const { name, rpcUrls, blockExplorers } = metadata;

    if (!this.providers[name] && (rpcUrls?.length || blockExplorers?.length)) {
      this.providers[name] = new HyperlaneSmartProvider(name, rpcUrls, blockExplorers);
    }

    return (this.providers[name] as HyperlaneSmartProvider) || null;
  }
}

export function buildSmartProvider(customChainConfigs: ChainMap<ChainConfig>) {
  logger.debug('Building new SmartMultiProvider');
  return new SmartMultiProvider({ ...chainMetadata, ...customChainConfigs });
}
