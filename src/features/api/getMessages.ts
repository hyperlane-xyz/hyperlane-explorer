import { Client } from '@urql/core';
import type { NextApiRequest } from 'next';

import { API_GRAPHQL_QUERY_LIMIT } from '../../consts/api';
import { logger } from '../../utils/logger';
import { sanitizeString } from '../../utils/string';
import { MessageIdentifierType, buildMessageQuery } from '../messages/queries/build';
import { MessagesQueryResult } from '../messages/queries/fragments';
import { parseMessageQueryResult } from '../messages/queries/parse';

import { ApiHandlerResult, ApiMessage, toApiMessage } from './types';
import { failureResult, successResult } from './utils';

export async function handler(
  req: NextApiRequest,
  client: Client,
): Promise<ApiHandlerResult<ApiMessage[]>> {
  const identifierParam = parseQueryParams(req);
  if (!identifierParam) return failureResult('No message identifier param provided');

  logger.debug('Attempting to find messages matching:', identifierParam);
  const { query, variables } = buildMessageQuery(
    identifierParam.type,
    identifierParam.value,
    API_GRAPHQL_QUERY_LIMIT,
  );
  const result = await client.query<MessagesQueryResult>(query, variables).toPromise();
  const messages = parseMessageQueryResult(result.data);
  return successResult(messages.map(toApiMessage));
}

// TODO replace with Zod
export function parseQueryParams({ query }: NextApiRequest) {
  for (const param of Object.values(MessageIdentifierType)) {
    const value = query[param];
    if (value && typeof value === 'string') {
      const sanitized = sanitizeString(value);
      return { type: param, value: sanitized };
    }
  }
  return null;
}
