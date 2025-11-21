import { Client } from '@urql/core';

import { GithubRegistry } from '@hyperlane-xyz/registry';
import { MultiProtocolProvider } from '@hyperlane-xyz/sdk';

import { config } from '../../consts/config';
import { logger } from '../../utils/logger';
import { DOMAINS_QUERY, DomainsEntry } from '../chains/queries/fragments';

// TODO de-dupe this with store.ts and handle registry/multiProvider concerns in a single place
export async function getMultiProvider(): Promise<MultiProtocolProvider> {
  const registry = new GithubRegistry({ proxyUrl: config.githubProxy });
  const chainMetadata = await registry.getMetadata();
  return new MultiProtocolProvider(chainMetadata);
}

export async function getScrapedChains(client: Client): Promise<Array<DomainsEntry>> {
  logger.debug('Fetching list of scraped chains');
  const result = await client.query<{ domain: Array<DomainsEntry> }>(DOMAINS_QUERY, {}).toPromise();
  return result.data?.domain || [];
}
