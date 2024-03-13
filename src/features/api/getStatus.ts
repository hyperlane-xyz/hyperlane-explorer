import { Client } from '@urql/core';
import type { NextApiRequest } from 'next';

import { MultiProvider } from '@hyperlane-xyz/sdk';

import { API_GRAPHQL_QUERY_LIMIT } from '../../consts/api';
import { MessageStatus } from '../../types';
import { logger } from '../../utils/logger';
import { buildMessageQuery } from '../messages/queries/build';
import { MessagesStubQueryResult } from '../messages/queries/fragments';
import { parseMessageStubResult } from '../messages/queries/parse';

import { parseQueryParams } from './getMessages';
import { ApiHandlerResult } from './types';
import { failureResult, successResult } from './utils';

interface MessageStatusResult {
  id: string;
  status: MessageStatus;
}

export async function handler(
  req: NextApiRequest,
  client: Client,
): Promise<ApiHandlerResult<MessageStatusResult[]>> {
  const identifierParam = parseQueryParams(req);
  if (!identifierParam) return failureResult('No message identifier param provided');

  logger.debug('Attempting to find message status matching:', identifierParam);
  const { query, variables } = buildMessageQuery(
    identifierParam.type,
    identifierParam.value,
    API_GRAPHQL_QUERY_LIMIT,
    true,
  );
  const result = await client.query<MessagesStubQueryResult>(query, variables).toPromise();

  const multiProvider = new MultiProvider();
  const messages = parseMessageStubResult(multiProvider, result.data);

  return successResult(messages.map((m) => ({ id: m.msgId, status: m.status })));
}
