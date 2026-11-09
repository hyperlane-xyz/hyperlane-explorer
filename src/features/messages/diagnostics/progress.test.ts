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
  [undefined, 'Pending relayer pickup', 'Relayer pickup pending'],
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

test('keeps expected commit delays pending and active', () => {
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
    active: true,
    activityStatus: 'Commit confirmation pending',
    relayStopped: false,
    status: 'Delivery pending',
  });
});

test('keeps pending offchain attestations active and explains the delay', () => {
  expect(
    progress(MessageStatus.Pending, 'retrying', {
      state: {
        phase: 'retrying',
        modules: [
          {
            ism: '0x01',
            node_id: 'root',
            children: [],
            module_type: 'CcipRead',
            metadata_error: 'Could not fetch metadata',
            metadata_status: 'blocked',
            offchain_read: { state: 'pending_retries_exhausted', endpoint: 0 },
          },
        ],
        retry: { reason: 'CouldNotFetchMetadata', count: 7 },
        failure: { stage: 'metadata', reason: 'CouldNotFetchMetadata' },
      },
    }),
  ).toMatchObject({
    active: true,
    activityStatus: 'Offchain attestation pending',
    explanation: 'The offchain attestation is pending. Relayers will continue automatically.',
    relayStopped: false,
    status: 'Delivery pending',
  });
});

test('keeps failed delivery attempts pending while relayers retry', () => {
  expect(
    progress(MessageStatus.Pending, 'retrying', {
      state: {
        phase: 'retrying',
        modules: [],
        retry: { reason: 'ErrorEstimatingGas' },
        failure: { stage: 'simulate', reason: 'contract_call_failed' },
      },
    }),
  ).toMatchObject({
    active: true,
    activityStatus: 'Retrying delivery',
    explanation: 'The message remains pending while relayers retry automatically.',
    relayStopped: false,
    status: 'Delivery pending',
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
