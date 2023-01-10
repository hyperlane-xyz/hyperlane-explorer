import { Client } from '@urql/core';
import type { NextApiRequest } from 'next';

import { API_GRAPHQL_QUERY_LIMIT } from '../../consts/api';
import { trimLeading0x } from '../../utils/addresses';
import { logger } from '../../utils/logger';
import { sanitizeString } from '../../utils/string';
import { buildMessageSearchQuery } from '../messages/queries/build';
import { MessagesQueryResult } from '../messages/queries/fragments';
import { parseMessageQueryResult } from '../messages/queries/parse';

import { ApiMessage, toApiMessage } from './types';

const SEARCH_QUERY_PARAM_NAME = 'query';

export async function handler(req: NextApiRequest, client: Client): Promise<ApiMessage[] | null> {
  const queryValue = parseQueryParam(req);
  if (!queryValue) return null;
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
  const messages = parseMessageQueryResult(result.data);
  return messages.map(toApiMessage);
}

function parseQueryParam({ query }: NextApiRequest) {
  const value = query[SEARCH_QUERY_PARAM_NAME];
  if (value && typeof value === 'string') {
    const sanitized = sanitizeString(value);
    return trimLeading0x(sanitized);
  }
  return null;
}
