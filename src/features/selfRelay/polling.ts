const MAX_NOT_READY_FAILURES = 3;
const NOT_READY_INTERVAL_MS = 30_000;

export class SelfRelayPrepareError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
  }
}

export function getSelfRelayRefetchInterval(error: unknown, failureCount: number): number | false {
  if (!(error instanceof SelfRelayPrepareError) || error.statusCode !== 409) return false;
  if (failureCount >= MAX_NOT_READY_FAILURES) return false;
  return NOT_READY_INTERVAL_MS * 2 ** Math.max(0, failureCount - 1);
}
