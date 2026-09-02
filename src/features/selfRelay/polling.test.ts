/** @jest-environment jsdom */

import { QueryClient, QueryObserver } from '@tanstack/query-core';

import {
  getSelfRelayRefetchInterval,
  isRetryableSelfRelayStatus,
  type PendingSelfRelayPreparation,
} from './polling';

describe('getSelfRelayRefetchInterval', () => {
  const pending: PendingSelfRelayPreparation = {
    status: 'pending',
    error: 'Metadata not ready',
  };

  it('backs off and bounds retryable preparation checks', () => {
    expect(getSelfRelayRefetchInterval(pending, 1)).toBe(30_000);
    expect(getSelfRelayRefetchInterval(pending, 2)).toBe(60_000);
    expect(getSelfRelayRefetchInterval(pending, 3)).toBe(false);
  });

  it('classifies metadata-pending responses as retryable', () => {
    expect(isRetryableSelfRelayStatus(409)).toBe(true);
  });

  it.each([400, 404, 422, 429, 500, 503])('does not repeat HTTP %i failures', (status) => {
    expect(isRetryableSelfRelayStatus(status)).toBe(false);
  });

  it('stops polling after three successful pending state transitions', async () => {
    jest.useFakeTimers();
    const queryClient = new QueryClient();
    const queryFn = jest.fn(async () => pending);
    const observer = new QueryObserver(queryClient, {
      queryKey: ['self-relay-polling-test'],
      queryFn,
      refetchInterval: (query) =>
        getSelfRelayRefetchInterval(query.state.data, query.state.dataUpdateCount),
      retry: false,
    });
    const unsubscribe = observer.subscribe(() => undefined);

    await jest.advanceTimersByTimeAsync(0);
    expect(queryFn).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(30_000);
    expect(queryFn).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(60_000);
    expect(queryFn).toHaveBeenCalledTimes(3);
    await jest.advanceTimersByTimeAsync(120_000);
    expect(queryFn).toHaveBeenCalledTimes(3);

    unsubscribe();
    queryClient.clear();
    jest.useRealTimers();
  });
});
