import type { NextApiRequest, NextApiResponse } from 'next';

import { handler as getMessagesHandler } from '../../features/api/getMessages';
import { handler as getStatusHandler } from '../../features/api/getStatus';
import { handler as searchMessagesHandler } from '../../features/api/searchMessages';
import { logger } from '../../utils/logger';

enum API_ACTION {
  GetMessages = 'get-messages',
  GetStatus = 'get-status',
  SearchMessages = 'search-messages',
}

const actionToHandler: Record<API_ACTION, (req: NextApiRequest) => any> = {
  [API_ACTION.GetMessages]: getMessagesHandler,
  [API_ACTION.GetStatus]: getStatusHandler,
  [API_ACTION.SearchMessages]: searchMessagesHandler,
};

interface ApiResult<R> {
  status: '0' | '1';
  message: string;
  result: R;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<ApiResult<any>>) {
  try {
    const apiAction = parseQueryParams(req);
    if (!apiAction) {
      const msg = 'Invalid module or action';
      logger.debug(msg);
      res.status(400).send(failureResult(msg));
      return;
    }

    logger.debug('Invoking handler for api request of type:', apiAction);
    const actionHandler = actionToHandler[apiAction];
    const result = await actionHandler(req);
    if (!result) {
      const msg = 'Invalid request params';
      logger.debug(msg);
      res.status(400).send(failureResult(msg));
      return;
    }

    res.status(200).json(successResult(result));
  } catch (error) {
    const msg = 'Unable to retrieve data';
    logger.error(msg, error);
    res.status(500).send(failureResult(msg));
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

function successResult<R>(result: R): ApiResult<R> {
  return { status: '1', message: 'OK', result };
}

function failureResult(message: string): ApiResult<any> {
  return { status: '0', message, result: {} };
}
