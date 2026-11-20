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
  it('shows successive CCIP outcomes from snapshots and deduplicates unchanged reads', () => {
    const denied = {
      state: 'domain_not_allowed',
      observed_at_millis: 110_900,
      endpoint: 0,
      attempt: 1,
      hostname: 'lookup.example',
      url_template: 'https://lookup.example/proof/{data}',
    };
    const success = {
      state: 'succeeded',
      endpoint: 0,
      attempt: 3,
      http_status: 200,
      result: { bytes: 2, keccak256: '0xdigest' },
    };
    const node = {
      node_id: 'root',
      ism: '0xism',
      children: [],
      module_type: 'CcipRead',
      offchain_read: success,
    };
    const entries = timeline([
      activity(1, 'preparing', 111_000, { modules: [{ ...node, offchain_read: denied }] }),
      activity(2, 'preparing', 111_300, {
        modules: [{ ...node, offchain_read: { ...denied, observed_at_millis: 111_200 } }],
      }),
      activity(3, 'preparing', 111_500, { modules: [node] }),
      activity(4, 'ready_to_submit', 112_000, { modules: [node] }),
    ]).filter((entry) => entry.kind === 'offchain_read');
    expect(entries).toHaveLength(3);
    expect(
      entries.filter((entry) => entry.status === 'failed').map((entry) => entry.timestamp),
    ).toEqual(expect.arrayContaining([110_900, 111_200]));
    expect(entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: 'failed',
          title: expect.stringContaining('ccipReadAllowedDomains'),
          summary: 'lookup.example · Attempt 1',
          offchainRead: denied,
        }),
        expect.objectContaining({
          status: 'complete',
          summary: 'Endpoint 1 · Attempt 3 · HTTP 200 · 2 bytes',
          offchainRead: success,
        }),
      ]),
    );
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
      { validator: validatorA, timestamp: 111_000, title: 'Signature collected (1/2)' },
      { validator: validatorB, timestamp: 113_000, title: 'Signature collected (2/2)' },
      { validator: validatorA, timestamp: 114_000, title: 'Signature collected (1/2)' },
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

  it('does not assign collection times to incomplete history', () => {
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

// Confirmation is a chain block timestamp, not a relayer observation or an estimate.
it.each([
  { confirmed: true, timestamp: 106_000, expected: 106_000 },
  { confirmed: true, timestamp: undefined, expected: undefined },
  { confirmed: false, timestamp: 106_000, expected: undefined },
])('uses only a confirmed origin block timestamp: %j', ({ confirmed, timestamp, expected }) => {
  const entries = timeline([], {
    originConfirmation: {
      confirmed,
      tracked: true,
      blockNumber: 105,
      required: 5,
      timestamp,
    },
  });
  expect(entries.find((entry) => entry.kind === 'origin_confirmed')).toMatchObject({
    title: 'Origin confirmed',
    summary: 'Block 105 · 5 blocks after dispatch',
    timestamp: expected,
    blockTimestamp: expected,
    timeSource: 'chain',
    rows: [],
    status: confirmed ? 'complete' : 'active',
  });
  if (expected !== undefined) {
    expect(entries.slice(0, 2).map((entry) => entry.kind)).toEqual([
      'dispatch',
      'origin_confirmed',
    ]);
  }
});

const preparationTitles = ['Prepare started', 'Gas preflight passed', 'Validator set resolved'];
const reorgTitles = [
  'Reorg checks passed',
  'No reorg reported',
  'Reorg reported',
  'Reorg reported · ignored',
  'Reorg check failed',
];

const validatorSet: DiagnosticModule = {
  node_id: 'root/0:0xism',
  ism: '0xism',
  children: [],
  module_type: 'MessageIdMultisig',
  validators: [validatorA, validatorB],
  threshold: 2,
};

function update(id: number, timestamp: number, state: Partial<DiagnosticState>) {
  const row = activity(id, 'preparing', timestamp, state);
  row.activity.type = 'snapshot_update';
  return row;
}

it('times explicit prepare checks at distinct observations and repeats them on a new attempt', () => {
  const preparing = { phase_started_at_millis: 111_000, checks: { prepare: 'started' } };
  const gasPassed = {
    ...preparing,
    checks: { prepare: 'started', gas_preflight: 'succeeded' },
  };
  const resolved = { ...validatorSet, checks: { validator_set: 'succeeded' } };
  const retry = {
    ...preparing,
    phase_started_at_millis: 112_000,
    retry: { count: 1, reason: 'GasPaymentRequirementNotMet' },
  };
  const retryGasPassed = { ...retry, checks: gasPassed.checks };
  const rows = [
    activity(1, 'preparing', 111_000, preparing),
    update(2, 111_100, gasPassed),
    update(3, 111_200, { ...gasPassed, modules: [resolved] }),
    update(4, 111_300, gasPassed),
    update(5, 111_400, { ...gasPassed, modules: [resolved] }),
    update(6, 111_500, {
      ...gasPassed,
      phase: 'retrying',
      phase_started_at_millis: 111_500,
      modules: [resolved],
      retry: retry.retry,
    }),
    update(7, 112_000, { ...retry, modules: [validatorSet] }),
    update(8, 112_100, { ...retryGasPassed, modules: [validatorSet] }),
    update(9, 112_200, { ...retryGasPassed, modules: [resolved] }),
  ];
  const entries = (historyComplete: boolean) =>
    timeline(rows, { historyComplete }).filter((entry) => preparationTitles.includes(entry.title));
  expect(entries(true).map(({ title, timestamp }) => [title, timestamp])).toEqual([
    ['Prepare started', 111_000],
    ['Gas preflight passed', 111_100],
    ['Validator set resolved', 111_200],
    ['Prepare started', 112_000],
    ['Gas preflight passed', 112_100],
    ['Validator set resolved', 112_200],
  ]);
  expect(entries(false).map(({ title, timestamp }) => [title, timestamp])).toEqual(
    entries(true).map(({ title }) => [title, undefined]),
  );
});

it('groups a fully clear set at the final check and keeps exceptional outcomes visible', () => {
  const clearA = { validator: validatorA, states: ['reorg_not_found'] };
  const clearB = {
    validator: `0x${'0'.repeat(24)}${validatorB.slice(2)}`,
    states: ['reorg_not_found'],
  };
  const reportedA = { validator: validatorA, states: ['reorg_reported'] };
  const ignoredA = { validator: validatorA, states: ['reorg_reported', 'reorg_ignored'] };
  const failedB = { validator: validatorB, states: ['reorg_check_failed'] };
  const withChecks = (...reorg_checks: { validator: string; states: string[] }[]) => ({
    modules: [{ ...validatorSet, reorg_checks }],
  });
  const rows = [
    activity(1, 'preparing', 111_000, { modules: [validatorSet] }),
    update(2, 111_100, withChecks(clearA)),
    update(3, 111_200, withChecks(clearA, clearB)),
    update(4, 111_300, withChecks(reportedA, clearB)),
    update(5, 111_400, withChecks(ignoredA, clearB)),
    update(6, 111_500, withChecks(ignoredA, failedB)),
    update(7, 111_600, withChecks(clearA, failedB)),
    update(8, 111_700, withChecks(clearA, clearB)),
    update(9, 111_800, withChecks(clearA, clearB)),
  ];
  const entries = (historyComplete: boolean) =>
    timeline(rows, { historyComplete })
      .filter((entry) => reorgTitles.includes(entry.title))
      .map(({ title, validator, timestamp }) => ({ title, validator, timestamp }));
  expect(entries(true)).toEqual([
    { title: 'Reorg checks passed', validator: undefined, timestamp: 111_200 },
    { title: 'Reorg reported', validator: validatorA, timestamp: 111_300 },
    { title: 'Reorg reported · ignored', validator: validatorA, timestamp: 111_400 },
    { title: 'Reorg check failed', validator: validatorB, timestamp: 111_500 },
    { title: 'Reorg checks passed', validator: undefined, timestamp: 111_700 },
  ]);
  expect(entries(false)).toEqual(
    entries(true).map((entry) => ({ ...entry, timestamp: undefined })),
  );
  const groups = timeline(rows).filter((entry) => entry.reorgResults);
  expect(groups.map((entry) => entry.rows.map((row) => row.id))).toEqual([
    ['2', '3'],
    ['7', '8'],
  ]);
  expect(groups[0].reorgResults).toEqual([
    { validator: validatorA, result: 'No reorg reported' },
    { validator: validatorB, result: 'No reorg reported' },
  ]);
  expect(timeline(rows.slice(0, 2)).filter((entry) => reorgTitles.includes(entry.title))).toEqual([
    expect.objectContaining({ title: 'No reorg reported', validator: validatorA }),
  ]);
});

it('does not infer prepare checks or reorg outcomes from unmarked legacy snapshots', () => {
  const rows = [
    activity(1, 'preparing', 111_000, { modules: [validatorSet] }),
    activity(2, 'awaiting_signatures', 112_000, {
      modules: [{ ...validatorSet, signatures: module([validatorA]).signatures }],
    }),
    activity(3, 'ready_to_submit', 113_000, { modules: [validatorSet] }),
  ];
  expect(
    timeline(rows).filter((entry) => [...preparationTitles, ...reorgTitles].includes(entry.title)),
  ).toHaveLength(0);
});

it('records a returning validator set and rechecks its shared validator', () => {
  const preparing = { phase_started_at_millis: 111_000, checks: { prepare: 'started' } };
  const original = { ...validatorSet, checks: { validator_set: 'succeeded' } };
  const replacement = {
    ...original,
    validators: [validatorA, '0x3333333333333333333333333333333333333333'],
  };
  const reorgChecks = [{ validator: validatorA, states: ['reorg_not_found'] }];
  const rows = [
    activity(1, 'preparing', 111_000, preparing),
    update(2, 111_100, { ...preparing, modules: [original] }),
    update(3, 111_200, { ...preparing, modules: [{ ...original, reorg_checks: reorgChecks }] }),
    update(4, 111_300, { ...preparing, modules: [replacement] }),
    update(5, 111_400, { ...preparing, modules: [{ ...replacement, reorg_checks: reorgChecks }] }),
    update(6, 111_500, { ...preparing, modules: [original] }),
    update(7, 111_600, { ...preparing, modules: [{ ...original, reorg_checks: reorgChecks }] }),
  ];
  const entries = timeline(rows);
  expect(
    entries
      .filter((entry) => entry.title === 'Validator set resolved')
      .map((entry) => entry.timestamp),
  ).toEqual([111_100, 111_300, 111_500]);
  expect(
    entries
      .filter((entry) => entry.title === 'No reorg reported')
      .map(({ validator, timestamp }) => [validator, timestamp]),
  ).toEqual([
    [validatorA, 111_200],
    [validatorA, 111_400],
    [validatorA, 111_600],
  ]);
});
