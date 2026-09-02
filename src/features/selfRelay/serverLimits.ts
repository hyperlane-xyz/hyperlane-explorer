export class InFlightLimit {
  private active = 0;

  constructor(private readonly maximum: number) {}

  run<T>(operation: () => Promise<T>): Promise<T> | undefined {
    if (this.active >= this.maximum) return undefined;
    this.active += 1;
    return operation().finally(() => {
      this.active -= 1;
    });
  }
}

export class SelfRelayPreparationTimeoutError extends Error {}

export function abortable<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(getAbortReason(signal));

  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      signal.removeEventListener('abort', onAbort);
      reject(getAbortReason(signal));
    };
    signal.addEventListener('abort', onAbort, { once: true });
    operation.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
  });
}

/**
 * Stops the preparation chain after the active operation settles. This keeps
 * capacity reserved for non-cancellable RPC work after the request times out.
 */
export async function abortAfterSettled<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  try {
    const value = await operation;
    if (signal.aborted) throw getAbortReason(signal);
    return value;
  } catch (error) {
    if (signal.aborted) throw getAbortReason(signal);
    throw error;
  }
}

export async function withDeadline<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
): Promise<T> {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    timeout = setTimeout(
      () =>
        controller.abort(new SelfRelayPreparationTimeoutError('Self-relay preparation timed out')),
      timeoutMs,
    );
    return await abortable(
      Promise.resolve().then(() => operation(controller.signal)),
      controller.signal,
    );
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function getAbortReason(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new Error('Self-relay preparation aborted');
}
