import { MultiProtocolProvider } from '@hyperlane-xyz/sdk';
import { config } from '../../../consts/config';
import { Message } from '../../../types';
import { logger } from '../../../utils/logger';
import { DomainsEntry } from '../../chains/queries/fragments';
import { MessageIdentifierType, buildMessageQuery } from './build';
import { MessagesQueryResult } from './fragments';
import { parseMessageQueryResult } from './parse';

const MAX_PREFETCHED_MESSAGES = 25;

const prefetchedMessageDetails = new Map<string, Message>();
const prefetchedMessageDetailPromises = new Map<string, Promise<Message | null>>();

export function getPrefetchedMessageDetails(messageId: string) {
  return prefetchedMessageDetails.get(messageId);
}

export function prefetchMessageDetails(
  messageId: string,
  multiProvider: MultiProtocolProvider,
  scrapedChains: DomainsEntry[],
) {
  const existing = prefetchedMessageDetails.get(messageId);
  if (existing) return Promise.resolve(existing);

  const inFlight = prefetchedMessageDetailPromises.get(messageId);
  if (inFlight) return inFlight;

  const { query, variables } = buildMessageQuery(MessageIdentifierType.Id, messageId, 1);
  const promise = fetch(config.apiUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  })
    .then(async (response) => {
      if (!response.ok) throw new Error(`Prefetch failed with ${response.status}`);
      const body = (await response.json()) as {
        data?: MessagesQueryResult;
        errors?: Array<{ message?: string }>;
      };
      if (body.errors?.length) {
        throw new Error(body.errors[0]?.message || 'GraphQL prefetch failed');
      }
      const message = parseMessageQueryResult(multiProvider, scrapedChains, body.data)[0] || null;
      if (message) setPrefetchedMessageDetails(message);
      return message;
    })
    .catch((error) => {
      logger.debug('Error prefetching message details', messageId, error);
      return null;
    })
    .finally(() => {
      prefetchedMessageDetailPromises.delete(messageId);
    });

  prefetchedMessageDetailPromises.set(messageId, promise);
  return promise;
}

function setPrefetchedMessageDetails(message: Message) {
  if (prefetchedMessageDetails.has(message.msgId)) {
    prefetchedMessageDetails.delete(message.msgId);
  }
  prefetchedMessageDetails.set(message.msgId, message);

  if (prefetchedMessageDetails.size <= MAX_PREFETCHED_MESSAGES) return;

  const oldestKey = prefetchedMessageDetails.keys().next().value;
  if (oldestKey) prefetchedMessageDetails.delete(oldestKey);
}
