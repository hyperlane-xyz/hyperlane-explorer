import type { NextApiRequest } from 'next';

import { logger } from '../../utils/logger';
import { tryParseChainConfig } from '../chains/chainConfig';

import { parseSearchQueryParam } from './searchMessages';
import { ApiHandlerResult, ApiMessage } from './types';
import { failureResult, successResult } from './utils';

export async function handler(req: NextApiRequest): Promise<ApiHandlerResult<ApiMessage[]>> {
  const queryValue = parseSearchQueryParam(req);
  if (!queryValue) return failureResult('No query param provided');

  const parseResult = tryParseChainConfig(req.body);
  if (!parseResult.success) return failureResult(`Invalid chain configs: ${parseResult.error}`);

  const chainConfig = parseResult.chainConfig;
  if (!Object.values(chainConfig).length) return failureResult('No chain configs provided');

  logger.debug('Attempting to search for PI messages:', queryValue);
  // TODO consider supporting time/chain filters here
  return successResult([]);
}
