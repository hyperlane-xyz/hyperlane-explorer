import { Client } from '@urql/core';
import type { NextApiRequest } from 'next';

import { API_GRAPHQL_QUERY_LIMIT } from '../../consts/api';
import { MessageStatus } from '../../types';
import { logger } from '../../utils/logger';
import { buildMessageQuery } from '../messages/queries/build';
import { MessagesStubQueryResult } from '../messages/queries/fragments';
import { parseMessageStubResult } from '../messages/queries/parse';

import { parseQueryParams } from './getMessages';

interface MessageStatusResult {
  id: string;
  status: MessageStatus;
}

export async function handler(
  req: NextApiRequest,
  client: Client,
): Promise<MessageStatusResult[] | null> {
  const identifierParam = parseQueryParams(req);
  if (!identifierParam) return null;
  logger.debug('Attempting to find message status matching:', identifierParam);
  const { query, variables } = buildMessageQuery(
    identifierParam.type,
    identifierParam.value,
    API_GRAPHQL_QUERY_LIMIT,
    true,
  );
  const result = await client.query<MessagesStubQueryResult>(query, variables).toPromise();
  const messages = parseMessageStubResult(result.data);
  return messages.map((m) => ({ id: m.msgId, status: m.status }));
}
