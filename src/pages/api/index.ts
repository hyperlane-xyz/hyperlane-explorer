import { Client, createClient } from '@urql/core';
import type { NextApiRequest, NextApiResponse } from 'next';
import NextCors from 'nextjs-cors';

import { config } from '../../consts/config';
import { handler as getMessagesHandler } from '../../features/api/getMessages';
import { handler as getStatusHandler } from '../../features/api/getStatus';
import { handler as searchMessagesHandler } from '../../features/api/searchMessages';
import { handler as searchPiMessagesHandler } from '../../features/api/searchPiMessages';
import { ApiHandlerResult } from '../../features/api/types';
import { logger } from '../../utils/logger';

enum API_ACTION {
  GetMessages = 'get-messages',
  GetStatus = 'get-status',
  SearchMessages = 'search-messages',
  SearchPiMessages = 'search-pi-messages',
}

const actionToHandler: Record<
  API_ACTION,
  (req: NextApiRequest, client: Client) => Promise<ApiHandlerResult<any>>
> = {
  [API_ACTION.GetMessages]: getMessagesHandler,
  [API_ACTION.GetStatus]: getStatusHandler,
  [API_ACTION.SearchMessages]: searchMessagesHandler,
  [API_ACTION.SearchPiMessages]: searchPiMessagesHandler,
};

interface ApiResult<R> {
  status: '0' | '1';
  message: string;
  result: R;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<ApiResult<any>>) {
  await NextCors(req, res, {
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE'],
    origin: '*',
    optionsSuccessStatus: 200,
  });

  try {
    const apiAction = parseQueryParams(req);
    if (!apiAction) {
      const msg = 'Invalid module or action';
      logger.debug(msg);
      res.status(400).send(failureApiResult(msg));
      return;
    }

    const client = createClient({
      url: config.apiUrl,
    });

    logger.debug('Invoking handler for api request of type:', apiAction);
    const actionHandler = actionToHandler[apiAction];
    const result = await actionHandler(req, client);

    if (!result.success) {
      logger.debug('Handler failed:', result.error);
      res.status(400).send(failureApiResult(result.error));
      return;
    }

    res.status(200).json(successApiResult(result.data));
  } catch (error) {
    const msg = 'Unable to retrieve data';
    logger.error(msg, error);
    res.status(500).send(failureApiResult(msg));
  }
}

function parseQueryParams({ query }: NextApiRequest): API_ACTION | null {
  const apiModule = query.module;
  if (!apiModule || typeof apiModule !== 'string' || apiModule.toLowerCase() !== 'message') {
    // Invalid module, only 'message' allowed for now
    return null;
  }
  const apiAction = query.action;
  const allActions = Object.values(API_ACTION) as string[];
  if (
    !apiAction ||
    typeof apiAction !== 'string' ||
    !allActions.includes(apiAction.toLowerCase())
  ) {
    // Invalid action
    return null;
  }
  return apiAction.toLowerCase() as API_ACTION;
}

function successApiResult<R>(result: R): ApiResult<R> {
  return { status: '1', message: 'OK', result };
}

function failureApiResult(message: string): ApiResult<any> {
  return { status: '0', message, result: [] };
}
