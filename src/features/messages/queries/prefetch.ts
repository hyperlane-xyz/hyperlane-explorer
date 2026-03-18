import { config } from '../../../consts/config';
import { Message, MessageStub } from '../../../types';
import { logger } from '../../../utils/logger';
import type { ChainMetadataResolver } from '../../chains/metadataManager';
import { DomainsEntry } from '../../chains/queries/fragments';
import { MessageIdentifierType, buildMessageQuery } from './build';
import { MessagesQueryResult } from './fragments';
import { parseMessageQueryResult } from './parse';

const MAX_PREFETCHED_MESSAGES = 25;

const prefetchedMessageStubs = new Map<string, MessageStub>();
const prefetchedMessageDetails = new Map<string, Message>();
const prefetchedMessageDetailPromises = new Map<string, Promise<Message | null>>();

export function clearPrefetchedMessages() {
  prefetchedMessageStubs.clear();
  prefetchedMessageDetails.clear();
  prefetchedMessageDetailPromises.clear();
}

export function getPrefetchedMessageStub(messageId: string) {
  return prefetchedMessageStubs.get(normalizeMessageCacheKey(messageId));
}

export function getPrefetchedMessageDetails(messageId: string) {
  return prefetchedMessageDetails.get(normalizeMessageCacheKey(messageId));
}

export function prefetchMessageStub(message: MessageStub) {
  setPrefetchedValue(prefetchedMessageStubs, normalizeMessageCacheKey(message.msgId), message);
}

export function prefetchMessageDetails(
  messageId: string,
  chainMetadataResolver: ChainMetadataResolver,
  scrapedChains: DomainsEntry[],
) {
  const cacheKey = normalizeMessageCacheKey(messageId);
  const existing = prefetchedMessageDetails.get(cacheKey);
  if (existing) return Promise.resolve(existing);

  const inFlight = prefetchedMessageDetailPromises.get(cacheKey);
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
      const message =
        parseMessageQueryResult(chainMetadataResolver, scrapedChains, body.data)[0] || null;
      if (message) setPrefetchedMessageDetails(message);
      return message;
    })
    .catch((error) => {
      logger.debug('Error prefetching message details', messageId, error);
      return null;
    })
    .finally(() => {
      prefetchedMessageDetailPromises.delete(cacheKey);
    });

  prefetchedMessageDetailPromises.set(cacheKey, promise);
  return promise;
}

function setPrefetchedMessageDetails(message: Message) {
  setPrefetchedValue(prefetchedMessageDetails, normalizeMessageCacheKey(message.msgId), message);
}

function normalizeMessageCacheKey(messageId: string) {
  return messageId.toLowerCase();
}

function setPrefetchedValue<T>(cache: Map<string, T>, key: string, value: T) {
  if (cache.has(key)) {
    cache.delete(key);
  }
  cache.set(key, value);

  if (cache.size <= MAX_PREFETCHED_MESSAGES) return;

  const oldestKey = cache.keys().next().value;
  if (oldestKey) cache.delete(oldestKey);
}
