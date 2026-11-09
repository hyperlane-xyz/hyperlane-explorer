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

function module(signers: string[], index = 10, root = 'root'): DiagnosticModule {
  return {
    node_id: 'root',
    ism: '0xism',
    children: [],
    module_type: 'MessageIdMultisig',
    signatures: {
      index,
      root,
      threshold: 2,
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
  it('orders chain events, signatures and relayer stages by their actual timestamps', () => {
    const rows = [
      activity(1, 'awaiting_signatures', 111_000, { modules: [module([])] }),
      activity(2, 'awaiting_signatures', 112_000, { modules: [module([validatorA])] }),
      activity(3, 'ready_to_submit', 114_000, { modules: [module([validatorA, validatorB])] }),
      activity(4, 'submitting', 119_000, {
        submission: { stage: 'submitted', observed_at_millis: 118_000 },
      }),
      activity(5, 'confirming', 126_100, {
        submission: { stage: 'included', observed_at_millis: 126_000 },
      }),
      activity(6, 'confirming', 130_100, {
        submission: { stage: 'finalized', observed_at_millis: 130_000 },
      }),
    ];
    const entries = timeline(rows, {
      message: { ...message, status: MessageStatus.Delivered },
    });
    expect(entries.map((entry) => entry.timestamp)).toEqual([
      100_000, 110_000, 111_000, 112_000, 114_000, 114_000, 118_000, 126_000, 126_000, 130_000,
    ]);
    expect(
      entries.filter((entry) => entry.kind === 'signature').map((entry) => entry.validator),
    ).toEqual([validatorA, validatorB]);
    expect(entries.find((entry) => entry.kind === 'submission')).toMatchObject({
      timestamp: 118_000,
      timestampRaw: new Date(118_000).toISOString(),
      timeSource: 'relayer',
    });
    expect(entries.find((entry) => entry.kind === 'delivery')).toMatchObject({
      timestamp: 126_000,
      blockTimestamp: 125_000,
      timeSource: 'relayer',
    });
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
  });

  it('does not collapse changed failures or changes to checkpoint, signer or verification state', () => {
    const rows = [
      activity(1, 'retrying', 111_000, { retry: { reason: 'NoMetadata' }, modules: [module([])] }),
      activity(2, 'retrying', 112_000, { retry: { reason: 'NoGas' }, modules: [module([])] }),
      activity(3, 'retrying', 113_000, { retry: { reason: 'NoGas' }, modules: [module([], 11)] }),
      activity(4, 'retrying', 114_000, {
        retry: { reason: 'NoGas' },
        modules: [module([validatorA], 11)],
      }),
      activity(5, 'retrying', 115_000, {
        retry: { reason: 'NoGas' },
        modules: [{ ...module([validatorA], 11), verification: 'failed' }],
      }),
    ];
    const entries = timeline(rows);
    expect(entries.filter((entry) => entry.kind === 'activity')).toHaveLength(4);
    expect(entries.find((entry) => entry.kind === 'signature')?.rows).toEqual([rows[3]]);
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
      { validator: validatorA, timestamp: 111_000, title: 'Signature observed' },
      { validator: validatorB, timestamp: 113_000, title: 'Signature collected' },
      { validator: validatorA, timestamp: 114_000, title: 'Signature observed' },
    ]);
    expect(entries[0].detail).toContain('actual signing and upload times are not recorded');
  });

  it('normalizes padded validator addresses when deduplicating', () => {
    const rows = [
      activity(1, 'awaiting_signatures', 111_000, { modules: [module([validatorA])] }),
      activity(2, 'awaiting_signatures', 112_000, {
        modules: [module([`0x${'0'.repeat(24)}${validatorA.slice(2)}`])],
      }),
    ];
    expect(timeline(rows).filter((entry) => entry.kind === 'signature')).toHaveLength(1);
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

  it('labels signatures in partial updates as observed and preserves microsecond source precision', () => {
    const partial = activity(3, 'ready_to_submit', 114_000, { modules: [module([validatorA])] });
    partial.activity.type = 'snapshot_update';
    partial.observed_at = '1970-01-01 00:01:54.123456+00';
    const signature = timeline([partial]).find((entry) => entry.kind === 'signature');
    expect(signature).toMatchObject({
      title: 'Signature observed',
      timestamp: 114_123,
      timestampRaw: '1970-01-01 00:01:54.123456+00',
    });
  });

  it('keeps unknown milestone timestamps unknown and preserves the mailbox recheck observation', () => {
    const row = activity(1, 'delivered', 135_000, {
      relayer_first_seen_at_millis: null,
      delivered_observed_at_millis: 132_000,
    });
    const entries = timeline([row], {
      message: { ...message, status: MessageStatus.Delivered },
    });
    expect(entries.find((entry) => entry.kind === 'pickup')?.timestamp).toBeUndefined();
    expect(entries.find((entry) => entry.kind === 'validation')?.timestamp).toBeUndefined();
    expect(entries.find((entry) => entry.kind === 'delivery')).toMatchObject({
      timestamp: 132_000,
      blockTimestamp: 125_000,
      status: 'complete',
    });
    expect(entries.find((entry) => entry.title === 'Relayer rechecked delivery')?.timestamp).toBe(
      132_000,
    );
  });

  it.each([undefined, null, 0, -1, NaN])(
    'falls back to the report time when the delivery-check timestamp is invalid (%s)',
    (timestamp) => {
      const entries = timeline([
        activity(1, 'delivered', 135_000, {
          delivered_observed_at_millis: timestamp,
        }),
      ]);
      expect(entries.find((entry) => entry.title === 'Relayer rechecked delivery')).toMatchObject({
        timestamp: 135_000,
        timestampRaw: new Date(135_000).toISOString(),
        timeSource: 'relayer',
      });
    },
  );

  it('does not infer chain delivery from relayer status', () => {
    const entries = timeline([activity(1, 'delivered', 135_000)]);
    expect(entries.find((entry) => entry.kind === 'delivery')).toMatchObject({
      status: 'pending',
      timestamp: undefined,
    });
  });

  it('orders relayer pickup from its recorded observation', () => {
    const entries = timeline([activity(1, 'preparing', 111_000)]);
    expect(
      entries.filter((entry) => entry.timestamp !== undefined).map((entry) => entry.kind),
    ).toEqual(['dispatch', 'pickup', 'activity']);
  });

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

  it('renders signatures from a current observation without manufacturing database history', () => {
    const current = observation(
      activity(20, 'ready_to_submit', 120_000, { modules: [module([validatorA])] }),
    );
    const signatures = timeline([], { observation: current }).filter(
      (entry) => entry.kind === 'signature',
    );
    expect(signatures).toHaveLength(1);
    expect(signatures[0]).toMatchObject({
      title: 'Signature observed',
      rows: [],
      timestamp: 120_000,
    });
  });

  it('retains malformed timestamps without ordering them as epoch zero', () => {
    const first = activity(1, 'preparing', 111_000);
    first.observed_at = 'invalid';
    const next = activity(2, 'preparing', 112_000);
    const entries = timeline([first, next]);
    expect(entries.filter((entry) => entry.kind === 'activity')).toHaveLength(2);
    expect(entries.find((entry) => entry.id === 'activity:1')?.timestamp).toBeUndefined();
  });

  it('does not interpret unknown diagnostic versions as signatures or validation', () => {
    const older = activity(1, 'ready_to_submit', 111_000, { modules: [module([validatorA])] });
    older.version = 2;
    const current = activity(2, 'preparing', 112_000);
    const entries = timeline([older, current]);
    expect(entries.some((entry) => entry.kind === 'signature')).toBe(false);
    expect(entries.find((entry) => entry.id === 'activity:1')?.title).toBe(
      'Unrecognized relayer update',
    );
    expect(entries.find((entry) => entry.kind === 'validation')?.timestamp).toBeUndefined();
  });

  it('splits equivalent report groups at an intervening delivery milestone', () => {
    const rows = [111_000, 112_000, 114_000, 115_000].map((timestamp, index) =>
      activity(index + 1, 'retrying', timestamp, {
        retry: { reason: 'NoMetadata', count: index + 1 },
      }),
    );
    const entries = timeline(rows, {
      observation: observation(
        activity(5, 'retrying', 115_500, {
          submission: { stage: 'included', observed_at_millis: 113_000 },
        }),
      ),
      message: { ...message, status: MessageStatus.Delivered },
    });
    expect(
      entries
        .filter((entry) => entry.kind === 'activity')
        .map((entry) => ({
          timestamp: entry.timestamp,
          endTimestamp: entry.endTimestamp,
          repeatCount: entry.repeatCount,
        })),
    ).toEqual([
      { timestamp: 111_000, endTimestamp: 112_000, repeatCount: 2 },
      { timestamp: 114_000, endTimestamp: 115_000, repeatCount: 2 },
    ]);
    for (let index = 1; index < entries.length; index += 1) {
      const previous = entries[index - 1];
      const next = entries[index];
      if (previous.timestamp !== undefined && next.timestamp !== undefined)
        expect(previous.endTimestamp ?? previous.timestamp).toBeLessThanOrEqual(next.timestamp);
    }
  });

  it('splits an observation group at a signer event even when reporting clocks arrive out of order', () => {
    const rows = [111_000, 112_000, 114_000, 115_000].map((timestamp, index) =>
      activity(index + 1, 'awaiting_signatures', timestamp),
    );
    const latest = observation(
      activity(5, 'awaiting_signatures', 113_000, {
        modules: [module([validatorA])],
      }),
    );
    const entries = timeline(rows, { observation: latest });
    expect(
      entries.filter((entry) => entry.kind === 'activity').map((entry) => entry.repeatCount),
    ).toEqual([2, 2]);
    expect(entries.find((entry) => entry.kind === 'signature')?.timestamp).toBe(113_000);
  });

  it('shows a signer-only update once while retaining a separate validation transition', () => {
    const rows = [
      activity(1, 'awaiting_signatures', 111_000, { modules: [module([])] }),
      activity(2, 'awaiting_signatures', 112_000, { modules: [module([validatorA])] }),
      activity(3, 'ready_to_submit', 113_000, { modules: [module([validatorA, validatorB])] }),
    ];
    const entries = timeline(rows);
    expect(entries.filter((entry) => entry.rows.some((row) => row.id === '2'))).toHaveLength(1);
    expect(
      entries
        .filter((entry) => entry.rows.some((row) => row.id === '3'))
        .map((entry) => entry.kind),
    ).toEqual(['signature', 'validation']);
  });

  it('does not claim the selected relayer validated when another relayer delivered', () => {
    const rows = [activity(1, 'preparing', 111_000)];
    const entries = timeline(rows, {
      message: { ...message, status: MessageStatus.Delivered },
    });
    expect(entries.find((entry) => entry.kind === 'validation')).toMatchObject({
      status: 'pending',
      timestamp: undefined,
    });
    expect(entries.find((entry) => entry.kind === 'delivery')?.status).toBe('complete');
    const dropped = timeline([activity(1, 'dropped', 111_000)], {
      message: { ...message, status: MessageStatus.Delivered },
    });
    expect(dropped.find((entry) => entry.kind === 'validation')?.status).toBe('failed');
  });

  it('collapses routing and polling bookkeeping while waiting for the same signatures', () => {
    const signatures = module([validatorA]).signatures;
    if (!signatures) throw new Error('Fixture must contain signatures');
    const rows = Array.from({ length: 10 }, (_, index) =>
      activity(index + 1, 'awaiting_signatures', 111_000 + index * 100, {
        retry: { reason: 'AwaitingValidatorSignatures', count: index + 1 },
        modules: [
          {
            ...module([validatorA]),
            selected_children: index % 2 ? ['child'] : undefined,
            checks: { merkle_leaf: index % 2 ? 'started' : 'succeeded' },
            verification: index % 2 ? 'started' : null,
            merkle_leaf: { highest_known: index },
            signatures: {
              ...signatures,
              latest_indices: [{ validator: validatorB, index }],
              discovery_unavailable:
                index % 2 ? [{ validator: validatorB, reason: 'missing' }] : [],
              unavailable: index % 2 ? [{ validator: validatorB, reason: 'missing' }] : [],
            },
          },
        ],
      }),
    );
    const entries = timeline(rows);
    const observations = entries.filter((entry) => entry.kind === 'activity');
    expect(observations).toHaveLength(1);
    expect(observations[0].repeatCount).toBe(10);
    expect(observations[0].rows).toEqual(rows);
    expect(entries.filter((entry) => entry.kind === 'signature')).toHaveLength(1);
  });

  it('keeps security failures and successful verification distinct from polling changes', () => {
    const rows = [
      activity(1, 'awaiting_signatures', 111_000, { modules: [module([validatorA])] }),
      activity(2, 'awaiting_signatures', 112_000, {
        modules: [{ ...module([validatorA]), checks: { merkle_leaf: 'failed' } }],
      }),
      activity(3, 'awaiting_signatures', 113_000, {
        modules: [{ ...module([validatorA]), verification: 'succeeded' }],
      }),
    ];
    const entries = timeline(rows).filter(
      (entry) => entry.kind === 'activity' || entry.kind === 'security',
    );
    expect(entries).toHaveLength(3);
    expect(entries[2].title).toBe('Message ID multisig verified');
  });

  it('labels routing and root readiness as security progress instead of repeated waiting', () => {
    const root: DiagnosticModule = {
      node_id: 'root',
      ism: 'root',
      module_type: 'Aggregation',
      children: [],
      metadata_status: 'blocked',
    };
    const route: DiagnosticModule = {
      node_id: 'route',
      ism: 'route',
      module_type: 'Routing',
      children: [],
      metadata_status: 'blocked',
    };
    const rows = [
      activity(1, 'awaiting_signatures', 111_000, { tree_root: 'root', modules: [root, route] }),
      activity(2, 'awaiting_signatures', 112_000, {
        tree_root: 'root',
        modules: [root, { ...route, metadata_status: 'ready', verification: 'succeeded' }],
      }),
      activity(3, 'awaiting_signatures', 113_000, {
        tree_root: 'root',
        modules: [
          { ...root, metadata_status: 'ready' },
          { ...route, metadata_status: 'ready', verification: 'succeeded' },
        ],
      }),
    ];
    expect(
      timeline(rows)
        .filter((entry) => entry.kind === 'activity' || entry.kind === 'security')
        .map((entry) => entry.title),
    ).toEqual(['Awaiting Signatures', 'Routing verified', 'Security requirements satisfied']);
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
      title: 'Signature observed',
      timestamp: 112_000,
      rows: [],
    });
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
      ['Delivered', 119_000],
    ]);
    expect(entries.find((entry) => entry.kind === 'delivery')).toMatchObject({
      blockTimestamp: 117_000,
      timeSource: 'relayer',
    });
    expect(entries.find((entry) => entry.title === 'Relayer rechecked delivery')?.timestamp).toBe(
      719_197,
    );
  });

  it('uses the earliest available inclusion report when its dedicated observation time is absent', () => {
    const first = activity(1, 'confirming', 120_000, { submission: { stage: 'included' } });
    first.observed_at = '1970-01-01 00:02:00.123456+00';
    const later = activity(2, 'confirming', 125_000, { submission: { stage: 'included' } });
    const entry = timeline([first, later], {
      message: { ...message, status: MessageStatus.Delivered },
    }).find((entry) => entry.kind === 'delivery');
    expect(entry).toMatchObject({
      timestamp: 120_123,
      timestampRaw: '1970-01-01 00:02:00.123456+00',
      blockTimestamp: 125_000,
      rows: [first],
    });
    expect(entry?.detail).toContain('upper bound');
  });

  it('does not invent an exact inclusion time from a current snapshot carrying an old submission stage', () => {
    const current = observation(
      activity(2, 'confirming', 125_000, { submission: { stage: 'included' } }),
    );
    const entry = timeline([], {
      observation: current,
      message: { ...message, status: MessageStatus.Delivered },
    }).find((entry) => entry.kind === 'delivery');
    expect(entry).toMatchObject({ timestamp: 125_000, rows: [] });
    expect(entry?.summary).toContain('earlier observation unavailable');
    expect(entry?.detail).toContain('upper bound');
  });

  it('preserves explicitly observed finalization before delivery', () => {
    const row = activity(1, 'confirming', 130_100, {
      submission: { stage: 'finalized', observed_at_millis: 130_000 },
    });
    const entries = timeline([row], {
      message: { ...message, status: MessageStatus.Delivered },
    });
    expect(
      entries.filter((entry) => entry.timestamp === 130_000).map((entry) => entry.kind),
    ).toEqual(['submission', 'delivery']);
    expect(entries.find((entry) => entry.kind === 'submission')).toMatchObject({
      title: 'Finalized',
      timestamp: 130_000,
      timeSource: 'relayer',
      rows: [row],
    });
  });

  it('keeps delivery observation unknown when only other relayers or unsupported records report inclusion', () => {
    const unknown = activity(1, 'confirming', 120_000, {
      submission: { stage: 'included', observed_at_millis: 119_000 },
    });
    unknown.version = 2;
    const other = activity(
      2,
      'confirming',
      121_000,
      { submission: { stage: 'included', observed_at_millis: 120_000 } },
      'other',
    );
    const current = activity(3, 'preparing', 125_000);
    const entries = timeline([unknown, other, current], {
      message: { ...message, status: MessageStatus.Delivered },
    });
    expect(entries.find((entry) => entry.kind === 'delivery')).toMatchObject({
      timestamp: undefined,
      blockTimestamp: 125_000,
      status: 'complete',
    });
  });

  it('does not claim pending delivery was observed', () => {
    const entries = timeline([]);
    expect(entries.find((entry) => entry.kind === 'delivery')?.summary).toBeUndefined();
    expect(entries.find((entry) => entry.kind === 'delivery')?.detail).toContain('Awaiting');
  });

  it('positions an untimed delivered milestone without inventing its observation timestamp', () => {
    const entries = timeline([], {
      message: { ...message, status: MessageStatus.Delivered },
    });
    expect(entries.find((entry) => entry.kind === 'delivery')).toMatchObject({
      timestamp: undefined,
      orderTimestamp: 125_000,
      blockTimestamp: 125_000,
    });
  });

  it.each([MessageStatus.Pending, MessageStatus.Delivered])(
    'omits synthetic origin and destination confirmation milestones for %s messages',
    (status) => {
      const entries = timeline([activity(1, 'preparing', 111_000)], {
        message: { ...message, status },
      });
      expect(entries.map((entry) => entry.kind)).not.toContain('origin_confirmation');
      expect(entries.map((entry) => entry.kind)).not.toContain('confirmation');
      expect(entries.map((entry) => entry.title)).not.toContain('Origin confirmed');
      expect(entries.map((entry) => entry.title)).not.toContain('Destination confirmed');
    },
  );

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

  it('places a sparse current waiter before future milestones without inventing a timestamp', () => {
    const entries = timeline([], {
      observation: observation(activity(1, 'awaiting_signatures', 111_000)),
    });
    const current = entries.find((entry) => entry.id === 'current_activity');
    expect(current).toMatchObject({ status: 'active', phase: 'awaiting_signatures', rows: [] });
    expect(current?.timestamp).toBeUndefined();
    expect(entries.findIndex((entry) => entry.id === 'current_activity')).toBeLessThan(
      entries.findIndex((entry) => entry.kind === 'validation'),
    );
  });

  it('uses the newest report ID to select current work despite out-of-order clocks', () => {
    const rows = [activity(1, 'preparing', 115_000), activity(2, 'preparing', 111_000)];
    const current = observation(activity(3, 'preparing', 116_000));
    const entries = timeline(rows, { observation: current });
    expect(
      entries
        .filter((entry) => entry.status === 'active')
        .flatMap((entry) => entry.rows.map((row) => row.id)),
    ).toEqual(['2']);
  });

  it('animates submission work alone and leaves observed inclusion complete', () => {
    const submitted = timeline([
      activity(1, 'submitting', 118_000, { submission: { stage: 'mempool' } }),
    ]);
    expect(
      submitted.filter((entry) => entry.status === 'active').map((entry) => entry.kind),
    ).toEqual(['submission']);
    expect(submitted.find((entry) => entry.kind === 'delivery')?.status).toBe('pending');
    const included = timeline([
      activity(2, 'confirming', 119_000, { submission: { stage: 'included' } }),
    ]);
    expect(included.find((entry) => entry.kind === 'submission')?.status).toBe('complete');
    expect(
      included.filter((entry) => entry.status === 'active').map((entry) => entry.kind),
    ).toEqual(['delivery']);
  });

  it('does not animate a delivery milestone alongside a post-validation retry', () => {
    const entries = timeline([
      activity(1, 'retrying', 119_000, {
        submission: { stage: 'retrying' },
        retry: { reason: 'TransactionSubmissionError' },
        failure: { stage: 'submit', reason: 'TransactionSubmissionError' },
      }),
    ]);
    expect(entries.filter((entry) => entry.status === 'active').map((entry) => entry.kind)).toEqual(
      ['activity'],
    );
    expect(entries.find((entry) => entry.kind === 'delivery')?.status).toBe('pending');
  });

  it('does not animate dropped relayer work', () => {
    const entries = timeline([activity(1, 'dropped', 111_000)], {
      message: { ...message, status: MessageStatus.Failing },
    });
    expect(entries.filter((entry) => entry.status === 'active')).toEqual([]);
  });

  it.each([MessageStatus.Unknown, MessageStatus.Delivered])(
    'does not animate stale relayer work for terminal message status %s',
    (status) => {
      const entries = timeline([activity(1, 'awaiting_signatures', 111_000)], {
        message: { ...message, status },
      });
      expect(entries.filter((entry) => entry.status === 'active')).toEqual([]);
    },
  );
});
