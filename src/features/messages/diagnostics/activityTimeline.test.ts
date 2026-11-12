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
    historyComplete: true,
    activities: rows,
    observation: rows.length ? observation(rows[rows.length - 1]) : undefined,
    ...extra,
  });
}

describe('message activity timeline', () => {
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
      { validator: validatorA, timestamp: 111_000, title: 'Signature discovered (1/2)' },
      { validator: validatorB, timestamp: 113_000, title: 'Signature discovered (2/2)' },
      { validator: validatorA, timestamp: 114_000, title: 'Signature discovered (1/2)' },
    ]);
    expect(entries[0].detail).toContain('not validator signing or upload');
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
    // Cached rereads do not add historical milestones; only the current wait remains.
    expect(entries.filter((entry) => entry.kind === 'activity')).toHaveLength(1);
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
    expect(entries.filter((entry) => entry.kind === 'delivery')).toHaveLength(1);
  });

  it('isolates selected relayer events and ignores observations newer than selected state', () => {
    const ours = activity(1, 'preparing', 111_000, { modules: [module([validatorA])] });
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

  it('does not assign discovery times to incomplete history', () => {
    const rows = [activity(1, 'awaiting_signatures', 111_000, { modules: [module([validatorA])] })];
    const signatures = timeline(rows, { historyComplete: false }).filter(
      (entry) => entry.kind === 'signature',
    );
    expect(signatures).toHaveLength(1);
    expect(signatures[0].timestamp).toBeUndefined();
  });
});

test('separates quorum, all metadata ready, and simulation completion without moving first times on reread', () => {
  const first = module([validatorA, validatorB], 10, 'root', 2);
  const ready = { ...first, metadata_status: 'ready' };
  const rows = [
    activity(1, 'awaiting_signatures', 111_000, { tree_root: 'root', modules: [first] }),
    activity(2, 'awaiting_signatures', 111_300, { tree_root: 'root', modules: [ready] }),
    activity(3, 'ready_to_submit', 111_400, { tree_root: 'root', modules: [ready] }),
    activity(4, 'submitting', 111_500, { tree_root: 'root', modules: [ready] }),
  ];
  const entries = timeline(rows);
  expect(
    entries.filter((entry) => entry.title.startsWith('Signature threshold reached')),
  ).toMatchObject([{ timestamp: 111_000 }]);
  expect(entries.filter((entry) => entry.title === 'All metadata ready')).toMatchObject([
    { timestamp: 111_300 },
  ]);
  expect(entries.filter((entry) => entry.kind === 'validation')).toMatchObject([
    { timestamp: 111_400 },
  ]);
});

test('does not combine signatures across conflicting roots to invent quorum', () => {
  const rows = [
    activity(1, 'awaiting_signatures', 111_000, { modules: [module([validatorA], 10, 'a')] }),
    activity(2, 'awaiting_signatures', 112_000, { modules: [module([validatorB], 10, 'b')] }),
    activity(3, 'awaiting_signatures', 113_000, { modules: [module([validatorA], 11, 'a')] }),
  ];
  expect(
    timeline(rows).filter((entry) => entry.title.startsWith('Signature threshold reached')),
  ).toHaveLength(0);
});
