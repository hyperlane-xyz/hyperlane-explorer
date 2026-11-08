import { MessageStatus } from '../../../types';
import { diagnosticsConnectionLabel, getMessageProgress } from './progress';

const progress = (
  messageStatus: MessageStatus,
  phase?: string,
  extra: Partial<Parameters<typeof getMessageProgress>[0]> = {},
) =>
  getMessageProgress({
    messageStatus,
    state: phase ? { phase, modules: [] } : undefined,
    confirmed: false,
    confirmationTracked: true,
    ...extra,
  });

test.each([
  [undefined, 'Waiting for relayer pickup', 'Awaiting relayer pickup'],
  ['preparing', 'Validating message', 'Validating message'],
  ['ready_to_submit', 'Validated · preparing delivery', 'Validated · preparing delivery'],
  ['submitting', 'Delivering message', 'Delivering message'],
])('maps the current relay phase once for both progress views', (phase, status, activityStatus) => {
  expect(progress(MessageStatus.Pending, phase)).toMatchObject({
    active: true,
    status,
    activityStatus,
  });
});

test('keeps expected commit waits neutral while stopping relay animation', () => {
  expect(
    progress(MessageStatus.Pending, 'retrying', {
      state: {
        phase: 'retrying',
        modules: [],
        retry: { reason: 'AwaitingIcaReveal' },
        failure: { stage: 'simulate', reason: 'contract_call_failed' },
      },
    }),
  ).toMatchObject({
    activityStatus: 'Waiting for commit confirmation',
    blocked: false,
    relayStopped: true,
    status: 'Waiting for commit confirmation',
  });
});

test('prefers current mempool progress and canonical delivery state', () => {
  expect(
    progress(MessageStatus.Pending, 'submitting', {
      state: { phase: 'submitting', modules: [], submission: { stage: 'mempool' } },
    }).activityStatus,
  ).toBe('In destination mempool');
  expect(progress(MessageStatus.Delivered, 'retrying', { confirmed: true })).toMatchObject({
    delivered: true,
    relayStopped: false,
    status: 'Delivery confirmed',
    activityStatus: 'Delivery confirmed',
  });
});

test('labels diagnostics connection state consistently', () => {
  expect(
    (['historical', 'connecting', 'live', 'disconnected'] as const).map(diagnosticsConnectionLabel),
  ).toEqual(['Recorded', 'Connecting', 'Live', 'Reconnecting']);
});
