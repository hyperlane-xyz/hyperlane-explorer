import { GithubRegistry } from '@hyperlane-xyz/registry';
import { Client } from '@urql/core';

import { config } from '../../consts/config';
import { logger } from '../../utils/logger';
import { DOMAINS_QUERY, DomainsEntry } from '../chains/queries/fragments';
import { createRuntimeMultiProvider, type ExplorerMultiProvider } from '../hyperlane/sdkRuntime';

// TODO de-dupe this with store.ts and handle registry/multiProvider concerns in a single place
export async function getMultiProvider(): Promise<ExplorerMultiProvider> {
  const registry = new GithubRegistry({ proxyUrl: config.githubProxy });
  const chainMetadata = await registry.getMetadata();
  return createRuntimeMultiProvider(chainMetadata);
}

export async function getScrapedChains(client: Client): Promise<Array<DomainsEntry>> {
  logger.debug('Fetching list of scraped chains');
  const result = await client.query<{ domain: Array<DomainsEntry> }>(DOMAINS_QUERY, {}).toPromise();
  return result.data?.domain || [];
}
