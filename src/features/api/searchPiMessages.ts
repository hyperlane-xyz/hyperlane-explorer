import type { NextApiRequest } from 'next';
import { z } from 'zod';

import { GithubRegistry } from '@hyperlane-xyz/registry';
import { ChainMetadataSchema, MultiProvider } from '@hyperlane-xyz/sdk';
import { Result, failure, success } from '@hyperlane-xyz/utils';

import { config } from '../../consts/config';
import { logger } from '../../utils/logger';
import {
  PiMessageQuery,
  fetchMessagesFromPiChain,
} from '../messages/pi-queries/fetchPiChainMessages';

import { ApiMessage } from './types';

const queryParamSchema = z.object({
  query: z.string(),
  fromBlock: z.string().optional(),
  toBlock: z.string().optional(),
});

export async function handler(req: NextApiRequest): Promise<Result<ApiMessage[]>> {
  const query = tryParseParams(req);
  if (!query) return failure('Invalid query params provided');

  const parseResult = ChainMetadataSchema.safeParse(req.body);
  if (!parseResult.success) return failure(`Invalid chain configs: ${parseResult.error}`);
  const chainMetadata = parseResult.data;

  try {
    logger.debug('Attempting to search for PI messages:', query);
    const multiProvider = new MultiProvider({ [chainMetadata.name]: chainMetadata });
    const registry = new GithubRegistry({ proxyUrl: config.githubProxy });
    // TODO consider supporting block/time/chain filters here
    const messages = await fetchMessagesFromPiChain(chainMetadata, query, multiProvider, registry);
    logger.debug(`Found ${messages.length} PI messages`);
    return success(messages);
  } catch (error) {
    logger.error('Error fetching PI messages', error);
    return failure('Unable to fetch messages, check config and query');
  }
}

function tryParseParams({ query }: NextApiRequest): PiMessageQuery | null {
  const result = queryParamSchema.safeParse(query);
  if (!result.success) return null;
  return {
    input: result.data.query,
    fromBlock: result.data.fromBlock,
    toBlock: result.data.toBlock,
  };
}
