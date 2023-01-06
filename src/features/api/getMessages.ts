import type { NextApiRequest } from 'next';

import { logger } from '../../utils/logger';

import { ApiMessage } from './types';

// The list of valid query params to search for
enum MessageIdentifier {
  Id = 'id',
  Sender = 'sender',
  Recipient = 'recipient',
  OriginTxHash = 'origin-tx-hash',
  OriginTxSender = 'origin-tx-sender',
  DestinationTxHash = 'destination-tx-hash',
  DestinationTxSender = 'destination-tx-sender',
}

export async function handler(req: NextApiRequest): Promise<ApiMessage[] | null> {
  const identifierParam = parseQueryParams(req);
  if (!identifierParam) return null;
  logger.debug('Attempting to find messages matching:', identifierParam);
  return [];
}

export function parseQueryParams({ query }: NextApiRequest) {
  for (const param of Object.values(MessageIdentifier)) {
    const value = query[param];
    if (value && typeof value === 'string') {
      return { type: param, value };
    }
  }
  return null;
}
