import { MessageStatus } from '../../../types';
import { formatElapsed, formatTimestamp, getActivityTimings, getMessageTimeline } from './timeline';
import type { DiagnosticActivity, DiagnosticState, RelayerDiagnosticState } from './types';

const message = {
  status: MessageStatus.Pending,
  origin: { hash: 'origin', timestamp: 100_000 },
  destination: { hash: 'destination', timestamp: 123_000 },
};
function activity(
  id: string,
  phase: string,
  timestamp: number,
  state: Partial<DiagnosticState> = {},
  relayer = 'main',
): DiagnosticActivity {
  return {
    id,
    relayer,
    observed_at: new Date(timestamp).toISOString(),
    activity: {
      type: 'snapshot',
      state: {
        phase,
        modules: [],
        relayer_first_seen_at_millis: 110_000,
        phase_started_at_millis: timestamp,
        ...state,
      },
    },
  };
}
const history = [
  activity('1', 'preparing', 110_000),
  activity('2', 'ready_to_submit', 115_000),
  activity('3', 'submitting', 118_000),
  activity('4', 'confirming', 121_000),
];
function observation(row: DiagnosticActivity): RelayerDiagnosticState {
  return {
    relayer: row.relayer,
    activityId: row.id,
    observedAt: row.observed_at,
    state: row.activity.state!,
  };
}
const current = observation(history[3]);
const stage = (timeline: ReturnType<typeof getMessageTimeline>, id: string) =>
  timeline.stages.find((entry) => entry.id === id)!;

describe('message lifecycle timing', () => {
  it('measures recorded milestones and end-to-end delivery separately from finality', () => {
    const timeline = getMessageTimeline(
      { ...message, status: MessageStatus.Delivered },
      current,
      history,
      {
        historyComplete: true,
        originConfirmation: { confirmed: true, tracked: true, timestamp: 108_000 },
      },
    );
    expect(timeline.stages.map((entry) => entry.timestamp)).toEqual([
      100_000,
      108_000,
      110_000,
      115_000,
      123_000,
      undefined,
    ]);
    expect(timeline.stages.map((entry) => entry.elapsedSincePrevious)).toEqual([
      undefined,
      8_000,
      2_000,
      5_000,
      8_000,
      undefined,
    ]);
    expect(stage(timeline, 'validated').sinceDispatch).toBe(15_000);
    expect(stage(timeline, 'delivered').timeSource).toBe('chain');
    expect(stage(timeline, 'validated').timeSource).toBe('relayer');
    expect(stage(timeline, 'confirmed').status).toBe('active');
    expect(timeline.totalElapsed).toBe(23_000);
    expect(timeline.timingComplete).toBe(true);
    expect(getActivityTimings(history, message.origin.timestamp).get('3')?.sinceDispatch).toBe(
      18_000,
    );
    const confirmed = getMessageTimeline(
      { ...message, status: MessageStatus.Delivered },
      current,
      history,
      { confirmed: true, historyComplete: true },
    );
    expect(stage(confirmed, 'confirmed')).toMatchObject({
      status: 'complete',
      timestamp: undefined,
    });
    expect(confirmed.timingComplete).toBe(true);
  });

  it('never promotes relayer-observed delivery or stale destination fields to indexed delivery', () => {
    const delivered = observation(activity('5', 'delivered', 122_000));
    const timeline = getMessageTimeline(message, delivered, history, {
      confirmed: true,
    });
    expect(timeline.stages.map((entry) => entry.status)).toEqual([
      'complete',
      'pending',
      'complete',
      'complete',
      'active',
      'pending',
    ]);
    expect(stage(timeline, 'delivered').timestamp).toBeUndefined();
    expect(stage(timeline, 'confirmed').timestamp).toBe(122_000);
    expect(timeline.totalElapsed).toBeUndefined();
  });

  it('keeps origin confirmation independent from fast-path relay and delivery evidence', () => {
    const pending = { confirmed: false, tracked: true, required: 15, blockNumber: 115 };
    const waiting = getMessageTimeline(message, undefined, history, {
      originConfirmation: pending,
    });
    expect(
      waiting.stages.filter((entry) => entry.status === 'active').map((entry) => entry.id),
    ).toEqual(['origin_confirmed']);
    expect(stage(waiting, 'picked_up').status).toBe('pending');
    const timeline = getMessageTimeline(message, current, history, { originConfirmation: pending });
    expect(stage(timeline, 'origin_confirmed')).toMatchObject({
      status: 'active',
      timestamp: undefined,
    });
    expect(stage(timeline, 'picked_up').status).toBe('complete');
    expect(stage(timeline, 'validated').status).toBe('complete');
    expect(stage(timeline, 'delivered').status).toBe('active');
    const delivered = getMessageTimeline(
      { ...message, status: MessageStatus.Delivered },
      current,
      history,
      { confirmed: true, originConfirmation: pending },
    );
    expect(stage(delivered, 'confirmed').status).toBe('complete');
    expect(stage(delivered, 'origin_confirmed').status).toBe('active');
    for (const originConfirmation of [undefined, { confirmed: false, tracked: false }]) {
      expect(
        stage(
          getMessageTimeline(message, current, history, { originConfirmation }),
          'origin_confirmed',
        ).status,
      ).toBe('pending');
    }
  });

  it('shows pickup before origin confirmation as a signed interval without inventing a missing boundary', () => {
    const originConfirmation = { confirmed: true, tracked: true, timestamp: 140_000 };
    const timeline = getMessageTimeline(message, current, history, { originConfirmation });
    expect(stage(timeline, 'origin_confirmed')).toMatchObject({
      status: 'complete',
      timestamp: 140_000,
      timeSource: 'chain',
      sinceDispatch: 40_000,
    });
    expect(stage(timeline, 'picked_up')).toMatchObject({
      elapsedSincePrevious: -30_000,
      sinceDispatch: 10_000,
    });
    const unknown = getMessageTimeline(
      { ...message, status: MessageStatus.Delivered },
      current,
      history,
      { historyComplete: true, originConfirmation: { confirmed: true, tracked: false } },
    );
    expect(stage(unknown, 'origin_confirmed')).toMatchObject({
      status: 'complete',
      timestamp: undefined,
    });
    expect(stage(unknown, 'picked_up').elapsedSincePrevious).toBeUndefined();
    expect(unknown.timingComplete).toBe(true);
  });

  it('records the selected relayer confirmation time separately from canonical finality', () => {
    const terminal = activity('6', 'delivered', 130_000, { delivered_observed_at_millis: 125_000 });
    const other = activity('5', 'delivered', 124_000, {}, 'other');
    const delivered = { ...message, status: MessageStatus.Delivered };
    const timeline = getMessageTimeline(delivered, observation(terminal), [
      ...history,
      other,
      terminal,
    ]);
    expect(stage(timeline, 'confirmed')).toMatchObject({
      status: 'active',
      timestamp: 125_000,
      timeSource: 'relayer',
      elapsedSincePrevious: 2_000,
    });
    expect(
      stage(
        getMessageTimeline(delivered, observation(terminal), history, { confirmed: true }),
        'confirmed',
      ),
    ).toMatchObject({ status: 'complete', timestamp: 125_000, timeSource: 'relayer' });
    const fallback = activity('6', 'delivered', 130_000, { phase_started_at_millis: 124_000 });
    expect(
      stage(getMessageTimeline(delivered, observation(fallback), history), 'confirmed').timestamp,
    ).toBe(130_000);
    const finalized = activity('6', 'confirming', 126_000, {
      submission: { stage: 'finalized', observed_at_millis: 126_000 },
    });
    expect(
      stage(getMessageTimeline(delivered, observation(finalized), history), 'confirmed').timestamp,
    ).toBeUndefined();
  });

  it('keeps phase timing unknown when bounded history has only a later phase', () => {
    const timeline = getMessageTimeline(
      { ...message, status: MessageStatus.Delivered },
      current,
      [history[2]],
      { historyComplete: false },
    );
    expect(stage(timeline, 'validated')).toMatchObject({
      status: 'complete',
      timestamp: undefined,
    });
    expect(stage(timeline, 'delivered').timestamp).toBe(123_000);
    expect(stage(timeline, 'delivered').elapsedSincePrevious).toBeUndefined();
    expect(timeline.timingComplete).toBe(false);
    const future = activity('9', 'ready_to_submit', 140_000);
    expect(
      stage(getMessageTimeline(message, current, [future]), 'validated').timestamp,
    ).toBeUndefined();
    const olderPage = getMessageTimeline(message, current, [history[0]]);
    expect(stage(olderPage, 'validated').timestamp).toBeUndefined();
    expect(stage(olderPage, 'delivered').timestamp).toBeUndefined();
  });

  it('uses only the selected reporter and only matching phase timestamps', () => {
    const other = activity(
      '2',
      'ready_to_submit',
      112_000,
      { relayer_first_seen_at_millis: 101_000 },
      'other',
    );
    const timeline = getMessageTimeline(message, current, [other, ...history]);
    expect(stage(timeline, 'picked_up').timestamp).toBe(110_000);
    expect(stage(timeline, 'validated').timestamp).toBe(115_000);
    const absent = getMessageTimeline(message, undefined, history);
    expect(stage(absent, 'picked_up')).toMatchObject({ status: 'active', timestamp: undefined });
    const ready = activity('2', 'ready_to_submit', 115_000, { phase_started_at_millis: null });
    expect(
      stage(getMessageTimeline(message, observation(ready), [ready]), 'validated').timestamp,
    ).toBe(115_000);
  });

  it('retracts milestones on retry and uses the new attempt after recovery', () => {
    const retry = activity('5', 'retrying', 125_000, {
      retry: { reason: 'ErrorSubmitting' },
      failure: { stage: 'simulate', reason: 'rpc_error' },
      submission: { stage: 'included', observed_at_millis: 121_000 },
    });
    const timeline = getMessageTimeline(message, observation(retry), [...history, retry]);
    expect(stage(timeline, 'validated')).toMatchObject({ status: 'failed', timestamp: undefined });
    expect(stage(timeline, 'delivered')).toMatchObject({
      status: 'pending',
      timestamp: undefined,
    });
    const waiting = activity('5', 'retrying', 125_000, {
      retry: { reason: 'AwaitingIcaReveal', count: 0 },
      failure: { stage: 'simulate', reason: 'contract_call_failed' },
    });
    expect(
      stage(getMessageTimeline(message, observation(waiting), history), 'validated').status,
    ).toBe('active');
    const ready = activity('6', 'ready_to_submit', 128_000);
    const recovered = getMessageTimeline(message, observation(ready), [...history, retry, ready]);
    expect(stage(recovered, 'validated').timestamp).toBe(128_000);
    expect(stage(recovered, 'delivered')).toMatchObject({ status: 'active', timestamp: undefined });
  });

  it('leaves missing and negative timing unknown instead of clamping it to zero', () => {
    const early = activity('1', 'preparing', 90_000, { relayer_first_seen_at_millis: 90_000 });
    const timeline = getMessageTimeline(
      {
        ...message,
        status: MessageStatus.Delivered,
        destination: { ...message.destination, timestamp: 95_000 },
      },
      observation(early),
      [early],
    );
    expect(stage(timeline, 'picked_up').timestamp).toBe(90_000);
    expect(stage(timeline, 'picked_up').elapsedSincePrevious).toBeUndefined();
    expect(stage(timeline, 'picked_up').sinceDispatch).toBeUndefined();
    expect(timeline.totalElapsed).toBeUndefined();
    const missing = getMessageTimeline(
      { ...message, origin: { ...message.origin, timestamp: 0 } },
      observation(activity('1', 'preparing', 110_000, { relayer_first_seen_at_millis: null })),
      [],
    );
    expect(stage(missing, 'dispatched').timestamp).toBeUndefined();
    expect(stage(missing, 'picked_up').timestamp).toBeUndefined();
  });
});

test('activity timing marks observations after delivery, normalizes PostgreSQL UTC, and rejects negative delays', () => {
  const row = (
    id: string,
    relayer: string,
    observed_at: string,
    received_at?: string,
  ): DiagnosticActivity => ({
    id,
    relayer,
    observed_at,
    received_at,
    activity: { type: 'snapshot' },
  });
  const rows = [
    row('12', 'main', '2026-11-07 12:00:01.900+00', '2026-11-07 12:00:01.800+00'),
    row('11', 'main', '2026-11-07 12:00:02.000'),
    row('10', 'other', '2026-11-07T12:00:01.500Z'),
    row('9', 'main', '2026-11-07 12:00:01.100000+00', '2026-11-07 12:00:01.200+00'),
  ];
  const timings = getActivityTimings(
    rows,
    Date.parse('2026-11-07T12:00:00Z'),
    Date.parse('2026-11-07T12:00:01.600Z'),
  );
  expect(timings.get('9')).toMatchObject({
    sinceDispatch: 1100,
    afterDelivery: undefined,
    ingestionDelay: 100,
  });
  expect(timings.get('10')?.afterDelivery).toBeUndefined();
  expect(timings.get('11')?.afterDelivery).toBe(400);
  expect(timings.get('12')).toMatchObject({ afterDelivery: 300, ingestionDelay: undefined });
});

test('formats debug durations without hiding negative or unavailable values', () => {
  expect(formatElapsed(248)).toBe('248ms');
  expect(formatElapsed(3200)).toBe('3.2s');
  expect(formatElapsed(123200)).toBe('2m 3.2s');
  expect(formatElapsed(3660000)).toBe('1h 1m');
  expect(formatElapsed(0)).toBe('0ms');
  expect(formatElapsed(-1)).toBe('Unknown');
  expect(formatElapsed(NaN)).toBe('Unknown');
  expect(formatTimestamp(0)).toBe('Unknown');
  expect(formatTimestamp(100_000)).toMatch(/\d{2}:\d{2}:\d{2}/);
});

test('optionally keeps tenths of seconds while carrying rounded minutes and hours', () => {
  expect(formatElapsed(16_000, 'tenths')).toBe('16.0s');
  expect(formatElapsed(16_340, 'tenths')).toBe('16.3s');
  expect(formatElapsed(75_000, 'tenths')).toBe('1m 15.0s');
  expect(formatElapsed(59_960, 'tenths')).toBe('1m');
  expect(formatElapsed(3_599_960, 'tenths')).toBe('1h');
  expect(formatElapsed(248, 'tenths')).toBe('248ms');
  expect(formatElapsed(16_000)).toBe('16s');
});
