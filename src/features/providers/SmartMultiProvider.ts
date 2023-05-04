import {
  ChainMap,
  ChainMetadata,
  ChainName,
  MultiProvider,
  chainMetadata,
} from '@hyperlane-xyz/sdk';

import { logger } from '../../utils/logger';
import type { ChainConfig } from '../chains/chainConfig';

import { HyperlaneSmartProvider } from './SmartProvider';

export class SmartMultiProvider extends MultiProvider {
  constructor(chainMetadata?: ChainMap<ChainMetadata>, options?: any) {
    super(chainMetadata, options);
    logger.debug('SmartMultiProvider constructed');
  }
  // Override to use SmartProvider instead of FallbackProvider
  tryGetProvider(chainNameOrId: ChainName | number): HyperlaneSmartProvider | null {
    const metadata = this.tryGetChainMetadata(chainNameOrId);
    if (!metadata) return null;
    const { name, publicRpcUrls, blockExplorers } = metadata;

    if (!this.providers[name] && (publicRpcUrls?.length || blockExplorers?.length)) {
      this.providers[name] = new HyperlaneSmartProvider(metadata);
    }

    return (this.providers[name] as HyperlaneSmartProvider) || null;
  }
}

export function buildSmartProvider(customChainConfigs: ChainMap<ChainConfig>) {
  return new SmartMultiProvider({ ...chainMetadata, ...customChainConfigs });
}
