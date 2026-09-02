import type { SelfRelayPrepareResponse } from './types';

const MAX_PENDING_ATTEMPTS = 3;
const PENDING_INTERVAL_MS = 30_000;
const RETRYABLE_STATUS_CODES = new Set([409]);

export interface PendingSelfRelayPreparation {
  status: 'pending';
  error: string;
}

export type SelfRelayPreparation =
  | Exclude<SelfRelayPrepareResponse, { status: 'error' }>
  | PendingSelfRelayPreparation;

export function isRetryableSelfRelayStatus(statusCode: number): boolean {
  return RETRYABLE_STATUS_CODES.has(statusCode);
}

export function getSelfRelayRefetchInterval(
  preparation: SelfRelayPreparation | undefined,
  pendingAttemptCount: number,
): number | false {
  if (preparation?.status !== 'pending' || pendingAttemptCount >= MAX_PENDING_ATTEMPTS)
    return false;
  return PENDING_INTERVAL_MS * 2 ** Math.max(0, pendingAttemptCount - 1);
}
