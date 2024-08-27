import { Client } from '@urql/core';
import type { NextApiRequest } from 'next';

import { API_GRAPHQL_QUERY_LIMIT } from '../../consts/api';
import { logger } from '../../utils/logger';
import { sanitizeString } from '../../utils/string';
import { buildMessageSearchQuery } from '../messages/queries/build';
import { MessagesQueryResult } from '../messages/queries/fragments';
import { parseMessageQueryResult } from '../messages/queries/parse';

import { ApiHandlerResult, ApiMessage, toApiMessage } from './types';
import { failureResult, getMultiProvider, getScrapedChains, successResult } from './utils';

const SEARCH_QUERY_PARAM_NAME = 'query';

export async function handler(
  req: NextApiRequest,
  client: Client,
): Promise<ApiHandlerResult<ApiMessage[]>> {
  const queryValue = parseSearchQueryParam(req);
  if (!queryValue) return failureResult('No query param provided');

  logger.debug('Attempting to search for messages:', queryValue);
  // TODO consider supporting time/chain filters here
  const { query, variables } = buildMessageSearchQuery(
    queryValue,
    null,
    null,
    null,
    null,
    API_GRAPHQL_QUERY_LIMIT,
  );
  const result = await client.query<MessagesQueryResult>(query, variables).toPromise();

  const multiProvider = await getMultiProvider();
  const scrapedChains = await getScrapedChains(client);

  const messages = parseMessageQueryResult(multiProvider, scrapedChains, result.data);

  return successResult(messages.map(toApiMessage));
}

// TODO replace with Zod
function parseSearchQueryParam({ query }: NextApiRequest) {
  const value = query[SEARCH_QUERY_PARAM_NAME];
  if (value && typeof value === 'string') {
    return sanitizeString(value);
  }
  return null;
}
