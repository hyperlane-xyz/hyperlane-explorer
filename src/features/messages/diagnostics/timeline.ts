import { MessageStatus, type MessageStub } from '../../../types';
import {
  isWaitingForCommit,
  type DiagnosticActivity,
  type DiagnosticState,
  type LifecycleStepStatus,
  type RelayerDiagnosticState,
} from './types';
import type { OriginConfirmation } from './useOriginConfirmation';

const stages = [
  ['dispatched', 'Dispatched'],
  ['origin_confirmed', 'Origin confirmed'],
  ['picked_up', 'Picked up by relayer'],
  ['validated', 'Validated'],
  ['delivered', 'Delivered'],
  ['confirmed', 'Confirmed'],
] as const;

export interface MessageTimelineStage {
  id: (typeof stages)[number][0];
  label: string;
  status: LifecycleStepStatus;
  timestamp?: number;
  timeSource?: 'chain' | 'relayer';
  elapsedSincePrevious?: number;
  sinceDispatch?: number;
}

export interface MessageTimelineOptions {
  confirmed?: boolean;
  confirmationTracked?: boolean;
  originConfirmation?: OriginConfirmation;
}

/** Current evidence controls progress; recorded history supplies timing, never completion. */
export function getMessageTimeline(
  message: Pick<MessageStub, 'status' | 'origin' | 'destination'>,
  observation: RelayerDiagnosticState | undefined,
  activities: DiagnosticActivity[],
  options: MessageTimelineOptions = {},
): { stages: MessageTimelineStage[]; totalElapsed?: number } {
  const delivered = message.status === MessageStatus.Delivered;
  const confirmed = delivered && options.confirmed === true;
  const state = observation?.state;
  const originConfirmation = options.originConfirmation;
  const validatingComplete = ['ready_to_submit', 'submitting', 'confirming', 'delivered'].includes(
    state?.phase ?? '',
  );
  const current = confirmed
    ? 6
    : delivered
      ? 5
      : validatingComplete
        ? 4
        : observation
          ? 3
          : originConfirmation?.tracked && !originConfirmation.confirmed
            ? 1
            : 2;
  const failed =
    !delivered && !!(state?.failure || state?.phase === 'dropped') && !isWaitingForCommit(state);
  const history = observation
    ? activities
        .filter((row) => row.relayer === observation.relayer && row.activity.state)
        // Older pages cannot replace the selected current observation with a future state.
        .filter(
          (row) =>
            !/^\d+$/.test(row.id) ||
            !/^\d+$/.test(observation.activityId) ||
            BigInt(row.id) <= BigInt(observation.activityId),
        )
        .map((row) => ({
          state: row.activity.state!,
          observedAt: row.observed_at,
          activityId: row.id,
        }))
    : [];
  if (observation) history.push(observation);
  history.sort((a, b) => compareIds(a.activityId, b.activityId));
  // A newer preparation/retry invalidates earlier validation milestones.
  const lastPreparation = history.findLastIndex((row) =>
    ['preparing', 'awaiting_signatures', 'retrying', 'dropped'].includes(row.state.phase ?? ''),
  );
  const attempt = history.slice(lastPreparation + 1);
  const firstSeen = earliest(
    history.map((row) => validTime(row.state.relayer_first_seen_at_millis)),
  );
  const dispatchedAt = validTime(message.origin.timestamp);
  const deliveredAt = delivered ? validTime(message.destination?.timestamp) : undefined;
  const originConfirmedAt = originConfirmation?.confirmed
    ? validTime(originConfirmation.timestamp)
    : undefined;
  const relayerConfirmedAt = earliest(
    attempt
      .filter((row) => row.state.phase === 'delivered')
      .map(
        ({ state, observedAt }) =>
          validTime(state.delivered_observed_at_millis) ?? parseObservationTime(observedAt),
      ),
  );
  const timestamps = [
    dispatchedAt,
    originConfirmedAt,
    firstSeen,
    validatingComplete || delivered ? validationTime(attempt) : undefined,
    deliveredAt,
    relayerConfirmedAt,
  ];
  const timeline = stages.map(([id, label], index): MessageTimelineStage => ({
    id,
    label,
    status:
      id === 'origin_confirmed'
        ? originConfirmation?.confirmed
          ? 'complete'
          : originConfirmation?.tracked
            ? 'active'
            : 'pending'
        : index < current
          ? 'complete'
          : index === current && !(id === 'confirmed' && options.confirmationTracked === false)
            ? failed
              ? 'failed'
              : 'active'
            : 'pending',
    timestamp: timestamps[index],
    timeSource:
      timestamps[index] === undefined
        ? undefined
        : index === 0 || index === 1 || index === 4
          ? 'chain'
          : 'relayer',
    // Fast-path relayers can pick up a message before configured origin finality.
    elapsedSincePrevious:
      id === 'picked_up' &&
      firstSeen !== undefined &&
      originConfirmedAt !== undefined &&
      (dispatchedAt === undefined || firstSeen >= dispatchedAt)
        ? firstSeen - originConfirmedAt
        : elapsed(timestamps[index - 1], timestamps[index]),
    sinceDispatch: elapsed(dispatchedAt, timestamps[index]),
  }));
  return {
    stages: timeline,
    totalElapsed: elapsed(dispatchedAt, deliveredAt),
  };
}

function validationTime(history: Array<{ state: DiagnosticState; observedAt: string }>) {
  return earliest(
    history
      .filter((row) => row.state.phase === 'ready_to_submit')
      .map(
        ({ state, observedAt }) =>
          validTime(state.phase_started_at_millis) ?? parseObservationTime(observedAt),
      ),
  );
}

function earliest(timestamps: Array<number | undefined>) {
  const known = timestamps.filter((time): time is number => time !== undefined);
  return known.length ? Math.min(...known) : undefined;
}

function validTime(timestamp?: number | null) {
  return timestamp != null && Number.isFinite(timestamp) && timestamp > 0 && timestamp <= 8.64e15
    ? timestamp
    : undefined;
}

function elapsed(from?: number, to?: number) {
  return from !== undefined && to !== undefined && to >= from ? to - from : undefined;
}

function parseObservationTime(value: string) {
  const timestamp = value
    .trim()
    .replace(' ', 'T')
    .replace(/([+-]\d{2})$/, '$1:00');
  return validTime(
    Date.parse(/(?:Z|[+-]\d{2}(?::?\d{2})?)$/i.test(timestamp) ? timestamp : timestamp + 'Z'),
  );
}

function compareIds(a: string, b: string) {
  if (!/^\d+$/.test(a) || !/^\d+$/.test(b)) return a.localeCompare(b);
  return BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0;
}

export function getActivityTimings(
  activities: DiagnosticActivity[],
  dispatchAt: number,
  deliveredAt?: number,
) {
  const timings = new Map<
    string,
    {
      timestamp?: number;
      sinceDispatch?: number;
      afterDelivery?: number;
      ingestionDelay?: number;
    }
  >();
  for (const row of activities) {
    const timestamp = parseObservationTime(row.observed_at);
    const receivedAt = row.received_at ? parseObservationTime(row.received_at) : undefined;
    timings.set(row.id, {
      timestamp,
      sinceDispatch: elapsed(validTime(dispatchAt), timestamp),
      afterDelivery: elapsed(validTime(deliveredAt), timestamp),
      ingestionDelay: elapsed(timestamp, receivedAt),
    });
  }
  return timings;
}

export function formatElapsed(milliseconds: number): string {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return 'Unknown';
  if (milliseconds < 1_000) return Math.round(milliseconds) + 'ms';
  const tenths = Math.round(milliseconds / 100);
  const hours = Math.floor(tenths / 36_000);
  const minutes = Math.floor((tenths % 36_000) / 600);
  const seconds = (tenths % 600) / 10;
  return [hours ? hours + 'h' : '', minutes ? minutes + 'm' : '', seconds ? seconds + 's' : '']
    .filter(Boolean)
    .join(' ');
}

export function formatTimestamp(timestamp: number): string {
  if (validTime(timestamp) === undefined) return 'Unknown';
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
    hour12: false,
  });
}
