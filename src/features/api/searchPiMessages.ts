import type { NextApiRequest } from 'next';
import { z } from 'zod';

import { GithubRegistry } from '@hyperlane-xyz/registry';
import { MultiProvider } from '@hyperlane-xyz/sdk';

import { config } from '../../consts/config';
import { logger } from '../../utils/logger';
import { tryParseChainConfig } from '../chains/chainConfig';
import {
  PiMessageQuery,
  fetchMessagesFromPiChain,
} from '../messages/pi-queries/fetchPiChainMessages';

import { ApiHandlerResult, ApiMessage } from './types';
import { failureResult, successResult } from './utils';

const queryParamSchema = z.object({
  query: z.string(),
  fromBlock: z.string().optional(),
  toBlock: z.string().optional(),
});

export async function handler(req: NextApiRequest): Promise<ApiHandlerResult<ApiMessage[]>> {
  const query = tryParseParams(req);
  if (!query) return failureResult('Invalid query params provided');

  const parseResult = tryParseChainConfig(req.body);
  if (!parseResult.success) return failureResult(`Invalid chain configs: ${parseResult.error}`);
  const chainConfig = parseResult.chainConfig;

  try {
    logger.debug('Attempting to search for PI messages:', query);
    const multiProvider = new MultiProvider({ [chainConfig.name]: chainConfig });
    const registry = new GithubRegistry({ proxyUrl: config.githubProxy });
    // TODO consider supporting block/time/chain filters here
    const messages = await fetchMessagesFromPiChain(chainConfig, query, multiProvider, registry);
    logger.debug(`Found ${messages.length} PI messages`);
    return successResult(messages);
  } catch (error) {
    logger.error('Error fetching PI messages', error);
    return failureResult('Unable to fetch messages, check config and query');
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
