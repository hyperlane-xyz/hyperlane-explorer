import { Client } from '@urql/core';

import { GithubRegistry } from '@hyperlane-xyz/registry';
import { MultiProvider } from '@hyperlane-xyz/sdk';

import { config } from '../../consts/config';
import { logger } from '../../utils/logger';
import { DOMAINS_QUERY, DomainsEntry } from '../chains/queries/fragments';

export function successResult<R>(data: R): { success: true; data: R } {
  return { success: true, data };
}

export function failureResult(error: string): { success: false; error: string } {
  return { success: false, error };
}

// TODO de-dupe this with store.ts and handle registry/multiProvider concerns in a single place
export async function getMultiProvider(): Promise<MultiProvider> {
  const registry = new GithubRegistry({ proxyUrl: config.githubProxy });
  const chainMetadata = await registry.getMetadata();
  return new MultiProvider(chainMetadata);
}

export async function getScrapedChains(client: Client): Promise<Array<DomainsEntry>> {
  logger.debug('Fetching list of scraped chains');
  const result = await client.query<{ domain: Array<DomainsEntry> }>(DOMAINS_QUERY, {}).toPromise();
  return result.data?.domain || [];
}
