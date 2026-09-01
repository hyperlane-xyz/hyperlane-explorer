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

export async function withDeadline<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new SelfRelayPreparationTimeoutError('Self-relay preparation timed out')),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
