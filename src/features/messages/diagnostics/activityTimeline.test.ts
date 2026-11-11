import { MessageStatus, type MessageStub } from '../../../types';
import { buildMessageActivityTimeline } from './activityTimeline';
import type {
  DiagnosticActivity,
  DiagnosticModule,
  DiagnosticState,
  RelayerDiagnosticState,
} from './types';

const message: MessageStub = {
  id: '1',
  msgId: '0xmessage',
  body: '0x',
  nonce: 1,
  sender: '0xsender',
  recipient: '0xrecipient',
  originChainId: 1,
  originDomainId: 1,
  destinationChainId: 8453,
  destinationDomainId: 8453,
  status: MessageStatus.Pending,
  origin: { hash: '0xorigin', timestamp: 100_000, blockNumber: 100 },
  destination: { hash: '0xdestination', timestamp: 125_000, blockNumber: 200 },
};
const validatorA = '0x1111111111111111111111111111111111111111';
const validatorB = '0x2222222222222222222222222222222222222222';
const validatorC = '0x3333333333333333333333333333333333333333';

function module(signers: string[], index = 10, root = 'root', threshold = 2): DiagnosticModule {
  return {
    node_id: 'root',
    ism: '0xism',
    children: [],
    module_type: 'MessageIdMultisig',
    signatures: {
      index,
      root,
      threshold,
      signers: signers.map((validator) => ({ validator })),
      unavailable: [],
    },
  };
}

function activity(
  id: number,
  phase: string,
  timestamp: number,
  state: Partial<DiagnosticState> = {},
  relayer = 'main',
): DiagnosticActivity {
  return {
    id: String(id),
    version: 1,
    relayer,
    observed_at: new Date(timestamp).toISOString(),
    activity: {
      type: 'snapshot',
      state: {
        phase,
        phase_started_at_millis: timestamp,
        relayer_first_seen_at_millis: 110_000,
        modules: [],
        ...state,
      },
    },
  };
}

function observation(row: DiagnosticActivity): RelayerDiagnosticState {
  const state = row.activity.state;
  if (!state) throw new Error('Fixture must contain snapshot state');
  return {
    relayer: row.relayer,
    activityId: row.id,
    observedAt: row.observed_at,
    state,
  };
}

function timeline(
  rows: DiagnosticActivity[],
  extra: Partial<Parameters<typeof buildMessageActivityTimeline>[0]> = {},
) {
  return buildMessageActivityTimeline({
    message,
    activities: rows,
    observation: rows.length ? observation(rows[rows.length - 1]) : undefined,
    ...extra,
  });
}

describe('message activity timeline', () => {
  it.each([2, 3])('numbers %s signatures first observed in one batch individually', (threshold) => {
    const row = activity(1, 'awaiting_signatures', 111_000, {
      modules: [
        module([validatorA, validatorB, validatorC].slice(0, threshold), 10, 'root', threshold),
      ],
    });
    const signatures = timeline([row, row]).filter((entry) => entry.kind === 'signature');
    expect(signatures.map((entry) => entry.title)).toEqual(
      Array.from(
        { length: threshold },
        (_, index) => `Signature observed (${index + 1}/${threshold})`,
      ),
    );
    expect(signatures.every((entry) => entry.timestamp === 111_000)).toBe(true);
  });

  it('numbers signatures in displayed timestamp order, separately per checkpoint', () => {
    const rows = [
      activity(1, 'awaiting_signatures', 113_000, { modules: [module([validatorA])] }),
      activity(2, 'awaiting_signatures', 112_000, { modules: [module([validatorB, validatorA])] }),
      activity(3, 'awaiting_signatures', 114_000, { modules: [module([validatorC], 11)] }),
    ];
    expect(
      timeline(rows)
        .filter((entry) => entry.kind === 'signature')
        .map(({ title, validator }) => [title, validator]),
    ).toEqual([
      ['Signature observed (1/2)', validatorB],
      ['Signature observed (2/2)', validatorA],
      ['Signature observed (1/2)', validatorC],
    ]);
  });
  it('shows signature progress through the threshold while retaining the validation step', () => {
    const rows = [
      activity(1, 'awaiting_signatures', 111_000, {
        modules: [module([validatorA], 10, 'root', 3)],
      }),
      activity(2, 'awaiting_signatures', 112_000, {
        modules: [module([validatorA, validatorB], 10, 'root', 3)],
      }),
      activity(3, 'ready_to_submit', 113_000, {
        modules: [module([validatorA, validatorB, validatorC], 10, 'root', 3)],
      }),
    ];
    const entries = timeline(rows);
    expect(
      entries.filter((entry) => entry.kind === 'signature').map((entry) => entry.title),
    ).toEqual(['Signature observed (1/3)', 'Signature observed (2/3)', 'Signature observed (3/3)']);
    expect(entries.find((entry) => entry.kind === 'validation')?.status).toBe('complete');
  });

  it('deduplicates signatures per module and checkpoint without claiming exact signing times', () => {
    const rows = [
      activity(1, 'awaiting_signatures', 111_000, { modules: [module([validatorA])] }),
      activity(2, 'awaiting_signatures', 112_000, { modules: [module([validatorA])] }),
      activity(3, 'awaiting_signatures', 113_000, { modules: [module([validatorA, validatorB])] }),
      activity(4, 'ready_to_submit', 114_000, { modules: [module([validatorA], 11)] }),
    ];
    const entries = timeline([...rows, rows[3]]).filter((entry) => entry.kind === 'signature');
    expect(
      entries.map(({ validator, timestamp, title }) => ({ validator, timestamp, title })),
    ).toEqual([
      { validator: validatorA, timestamp: 111_000, title: 'Signature observed (1/2)' },
      { validator: validatorB, timestamp: 113_000, title: 'Signature observed (2/2)' },
      { validator: validatorA, timestamp: 114_000, title: 'Signature observed (1/2)' },
    ]);
    expect(entries[0].detail).toContain('actual signing and upload times are not recorded');
  });

  it('applies cumulative updates to their anchor rather than the previous update', () => {
    const anchor = activity(1, 'awaiting_signatures', 111_000, { modules: [module([])] });
    const update = activity(2, 'awaiting_signatures', 112_000, { modules: [module([validatorA])] });
    update.activity.type = 'snapshot_update';
    const omitted = activity(3, 'awaiting_signatures', 113_000);
    omitted.activity.type = 'snapshot_update';
    const again = activity(4, 'awaiting_signatures', 114_000, { modules: [module([validatorA])] });
    again.activity.type = 'snapshot_update';
    const entries = timeline([anchor, update, omitted, again]);
    expect(entries.filter((entry) => entry.kind === 'signature')).toHaveLength(1);
    // The omitted node restores the anchor, so these are distinct observations.
    expect(entries.filter((entry) => entry.kind === 'activity')).toHaveLength(3);
  });

  it('collapses ten identical retries but preserves every exact report', () => {
    const rows = Array.from({ length: 10 }, (_, i) =>
      activity(i + 1, 'retrying', 111_000 + i * 100, {
        retry: {
          reason: 'CouldNotFetchMetadata',
          count: i + 1,
          next_attempt_at_millis: 115_000 + i * 100,
        },
        failure: { stage: 'metadata', reason: 'missing_signatures' },
        modules: [module([])],
      }),
    );
    const entries = timeline(rows).filter((entry) => entry.kind === 'activity');
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      repeatCount: 10,
      timestamp: 111_000,
      endTimestamp: 111_900,
    });
    expect(entries[0].rows).toEqual(rows);
    const changed = timeline([
      ...rows,
      activity(11, 'retrying', 112_000, {
        retry: { reason: 'NoGas' },
        failure: { stage: 'submit', reason: 'insufficient_gas' },
        modules: [module([])],
      }),
    ]).filter((entry) => entry.kind === 'activity');
    expect(changed).toHaveLength(2);
    expect(changed[1].rows[0].id).toBe('11');
  });

  it('collapses partial retries when unchanged modules alternate in and out of updates', () => {
    const routing: DiagnosticModule = {
      node_id: 'routing',
      ism: '0xrouting',
      children: [{ node_id: 'root', ism: '0xism' }],
      module_type: 'Routing',
      metadata_status: 'blocked',
      metadata_error: 'Awaiting validator signatures',
    };
    const rows = Array.from({ length: 10 }, (_, i) => {
      const row = activity(i + 1, 'awaiting_signatures', 111_000 + i * 100, {
        retry: { reason: 'AwaitingValidatorSignatures', count: i },
        modules: [...(i % 3 === 0 ? [routing] : []), module([validatorA])],
      });
      row.activity.type = 'snapshot_update';
      return row;
    });
    const entries = timeline(rows);
    const waiting = entries.filter((entry) => entry.kind === 'activity');
    expect(waiting).toHaveLength(1);
    expect(waiting[0]).toMatchObject({
      repeatCount: 10,
      timestamp: 111_000,
      endTimestamp: 111_900,
      rows,
      status: 'active',
    });
    expect(entries.filter((entry) => entry.kind === 'signature')).toHaveLength(1);

    const changed = activity(11, 'awaiting_signatures', 112_000, {
      retry: { reason: 'AwaitingValidatorSignatures' },
      modules: [{ ...routing, metadata_error: 'RPC request failed' }, module([validatorA])],
    });
    changed.activity.type = 'snapshot_update';
    expect(timeline([...rows, changed]).filter((entry) => entry.kind === 'activity')).toHaveLength(
      2,
    );
  });

  it('orders delivery after mempool and inclusion, never by an earlier block-header timestamp', () => {
    const rows = [
      activity(1, 'submitting', 118_100, {
        submission: { stage: 'mempool', observed_at_millis: 118_000 },
      }),
      activity(2, 'confirming', 119_100, {
        submission: { stage: 'included', observed_at_millis: 119_000 },
      }),
      activity(3, 'delivered', 719_197, { delivered_observed_at_millis: 719_197 }),
    ];
    const entries = timeline(rows, {
      message: {
        ...message,
        status: MessageStatus.Delivered,
        destination: { hash: 'destination', timestamp: 117_000 },
      },
    });
    expect(
      entries
        .filter((entry) => ['submission', 'delivery'].includes(entry.kind))
        .map((entry) => [entry.title, entry.timestamp]),
    ).toEqual([
      ['Mempool', 118_000],
      ['Included', 119_000],
      ['Delivered', 719_197],
    ]);
    expect(entries.find((entry) => entry.kind === 'delivery')).toMatchObject({
      blockTimestamp: 117_000,
      timeSource: 'relayer',
    });
    expect(entries.find((entry) => entry.title === 'Relayer rechecked delivery')?.timestamp).toBe(
      719_197,
    );
  });

  it.each([true, false])(
    'does not date delivery from an inclusion attempt (executed: %s)',
    (executed) => {
      const rows = [
        activity(1, 'confirming', 110_000, {
          submission: { stage: 'included', observed_at_millis: 110_000 },
          transaction: { transaction_id: 'failed', executed: false },
        }),
        activity(2, 'retrying', 120_000),
        activity(3, 'confirming', 130_000, {
          submission: { stage: 'included', observed_at_millis: 130_000 },
          transaction: { transaction_id: 'other', executed },
        }),
        activity(4, 'delivered', 140_000, { delivered_observed_at_millis: 140_000 }),
      ];
      const deliveredMessage = { ...message, status: MessageStatus.Delivered };
      expect(
        timeline(rows, { message: deliveredMessage }).find((entry) => entry.kind === 'delivery'),
      ).toMatchObject({ timestamp: 140_000, rows: [rows[3]] });
      expect(
        timeline(rows.slice(0, 3), { message: deliveredMessage }).find(
          (entry) => entry.kind === 'delivery',
        )?.timestamp,
      ).toBe(message.destination?.timestamp);
    },
  );

  it('isolates selected relayer events and ignores observations newer than selected state', () => {
    const ours = activity(1, 'preparing', 111_000);
    const other = activity(
      2,
      'ready_to_submit',
      112_000,
      { modules: [module([validatorA])] },
      'other',
    );
    const future = activity(3, 'ready_to_submit', 113_000);
    const entries = timeline([ours, other, future], { observation: observation(ours) });
    expect(entries.filter((entry) => entry.rows.length).map((entry) => entry.rows[0].id)).toEqual([
      '1',
    ]);
    expect(timeline([ours], { observation: undefined }).some((entry) => entry.rows.length)).toBe(
      false,
    );
  });

  it('animates the current waiting group while collected signatures stay complete', () => {
    const rows = [
      activity(1, 'awaiting_signatures', 111_000, { modules: [module([])] }),
      activity(2, 'awaiting_signatures', 112_000, { modules: [module([validatorA])] }),
    ];
    const entries = timeline(rows);
    expect(entries.filter((entry) => entry.status === 'active').map((entry) => entry.kind)).toEqual(
      ['activity'],
    );
    expect(entries.find((entry) => entry.kind === 'signature')?.status).toBe('complete');
    expect(entries.find((entry) => entry.kind === 'validation')?.status).toBe('pending');
    const validated = timeline([...rows, activity(3, 'ready_to_submit', 113_000)]);
    expect(validated.find((entry) => entry.kind === 'activity')?.status).toBe('complete');
    expect(validated.find((entry) => entry.kind === 'validation')?.status).toBe('complete');
  });

  it('retains current signatures from an unseen anchor when the partial update row is loaded', () => {
    const partial = activity(2, 'awaiting_signatures', 112_000);
    partial.activity.type = 'snapshot_update';
    const current = observation(partial);
    current.state = { ...current.state, modules: [module([validatorA])] };
    const signatures = timeline([partial], { observation: current }).filter(
      (entry) => entry.kind === 'signature',
    );
    expect(signatures).toHaveLength(1);
    expect(signatures[0]).toMatchObject({
      validator: validatorA,
      title: 'Signature observed (1/2)',
      timestamp: 112_000,
      rows: [],
    });
  });
});
