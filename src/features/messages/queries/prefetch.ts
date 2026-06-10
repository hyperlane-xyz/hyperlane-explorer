import { MessageStub } from '../../../types';

const MAX_PREFETCHED_MESSAGES = 25;

const prefetchedMessageStubs = new Map<string, MessageStub>();

export function clearPrefetchedMessages() {
  prefetchedMessageStubs.clear();
}

export function getPrefetchedMessageStub(messageId: string) {
  return prefetchedMessageStubs.get(normalizeMessageCacheKey(messageId));
}

export function prefetchMessageStub(message: MessageStub) {
  setPrefetchedValue(prefetchedMessageStubs, normalizeMessageCacheKey(message.msgId), message);
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
