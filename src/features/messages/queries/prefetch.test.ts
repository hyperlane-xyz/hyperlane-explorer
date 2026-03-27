import type { Message } from '../../../types';
import {
  clearPrefetchedMessages,
  getPrefetchedMessageDetails,
  prefetchMessageDetails,
} from './prefetch';

jest.mock('./parse', () => ({
  parseMessageQueryResult: jest.fn(),
}));

import { parseMessageQueryResult } from './parse';

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('prefetchMessageDetails', () => {
  const originalFetch = global.fetch;
  const resolver = {} as never;
  const messageId = '0xabc';
  const parsedMessage = { msgId: messageId } as Message;
  const mockedParseMessageQueryResult = jest.mocked(parseMessageQueryResult);
  const fetchMock = jest.fn() as jest.MockedFunction<typeof fetch>;

  beforeAll(() => {
    global.fetch = fetchMock;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  beforeEach(() => {
    clearPrefetchedMessages();
    fetchMock.mockReset();
    mockedParseMessageQueryResult.mockReset();
    mockedParseMessageQueryResult.mockReturnValue([parsedMessage]);
  });

  it('does not cache stale prefetched details after invalidation', async () => {
    const deferred = createDeferred<Response>();
    fetchMock.mockReturnValueOnce(deferred.promise);

    const promise = prefetchMessageDetails(messageId, resolver, []);
    clearPrefetchedMessages();

    deferred.resolve({
      ok: true,
      json: async () => ({ data: {} }),
    } as Response);

    await expect(promise).resolves.toBeNull();
    expect(getPrefetchedMessageDetails(messageId)).toBeUndefined();
  });

  it('keeps the latest in-flight promise after invalidation', async () => {
    const firstDeferred = createDeferred<Response>();
    const secondDeferred = createDeferred<Response>();
    fetchMock
      .mockReturnValueOnce(firstDeferred.promise)
      .mockReturnValueOnce(secondDeferred.promise);

    const firstPromise = prefetchMessageDetails(messageId, resolver, []);
    clearPrefetchedMessages();

    const secondPromise = prefetchMessageDetails(messageId, resolver, []);
    const dedupedSecondPromise = prefetchMessageDetails(messageId, resolver, []);
    expect(dedupedSecondPromise).toBe(secondPromise);

    firstDeferred.resolve({
      ok: true,
      json: async () => ({ data: {} }),
    } as Response);
    await expect(firstPromise).resolves.toBeNull();

    const stillDedupedPromise = prefetchMessageDetails(messageId, resolver, []);
    expect(stillDedupedPromise).toBe(secondPromise);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    secondDeferred.resolve({
      ok: true,
      json: async () => ({ data: {} }),
    } as Response);

    await expect(secondPromise).resolves.toBe(parsedMessage);
    expect(getPrefetchedMessageDetails(messageId)).toBe(parsedMessage);
  });
});
