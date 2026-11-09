import {
  DiagnosticActivity,
  describeDiagnosticActivity,
  diagnosticModuleStatus,
  messageDiagnosticsSchema,
  reduceMessageDiagnostics,
  reconcileDiagnosticObservations,
  selectRelayObservation,
  mergeActivityHistory,
  isWaitingForCommit,
} from './types';

const relayer = '0x1111111111111111111111111111111111111111';

function row(id: string, type: string, state: DiagnosticActivity['activity']['state']) {
  return {
    id,
    relayer,
    observed_at: `2026-01-01T00:00:0${id}.000Z`,
    activity: { type, state },
  };
}

describe('reduceMessageDiagnostics', () => {
  it('applies cumulative node replacements and removals to the anchor', () => {
    const result = reduceMessageDiagnostics({
      version: 1,
      message_id: '0x1234',
      partial: false,
      activities: [
        row('1', 'snapshot', {
          phase: 'preparing',
          tree_root: 'root',
          modules: [
            { ism: 'root', node_id: 'root', children: [] },
            { ism: 'old', node_id: 'old', children: [] },
          ],
        }),
        row('2', 'snapshot_update', {
          phase: 'awaiting_signatures',
          tree_root: 'root',
          modules: [
            {
              ism: 'root',
              node_id: 'root',
              children: [],
              signatures: {
                collected: 2,
                threshold: 3,
                unavailable: [],
                signers: [],
              },
            },
          ],
          removed_modules: ['old'],
        }),
      ],
    }).relayers;

    expect(result).toHaveLength(1);
    expect(result[0]?.state.phase).toBe('awaiting_signatures');
    expect(result[0]?.state.modules).toHaveLength(1);
    expect(result[0]?.state.modules[0]?.signatures?.collected).toBe(2);
  });
});

describe('messageDiagnosticsSchema', () => {
  it('accepts protocol-neutral nullable module observations', () => {
    expect(
      messageDiagnosticsSchema.safeParse({
        version: 1,
        message_id: '0x1234',
        partial: false,
        activities: [
          row('1', 'snapshot', {
            phase: 'preparing',
            tree_root: 'root',
            modules: [
              {
                ism: 'root',
                node_id: 'root',
                children: [],
                module_type: 'Null',
                threshold: null,
                verification: null,
                metadata_status: 'blocked',
                metadata_error: 'Awaiting validator signatures',
                offchain_read: {
                  state: 'pending',
                  endpoint: null,
                  http_status: null,
                },
              },
            ],
          }),
        ],
      }).success,
    ).toBe(true);
  });
});

describe('describeDiagnosticActivity', () => {
  it('does not present a previous submission as current progress during retry', () => {
    const value = row('1', 'snapshot_update', {
      phase: 'retrying',
      modules: [],
      submission: { stage: 'mempool' },
      retry: { reason: 'AwaitingIcaReveal' },
    });
    expect(describeDiagnosticActivity(value).label).toBe('Waiting for commit confirmation');
    expect(describeDiagnosticActivity(value).detail).not.toContain('Mempool');
  });

  it('summarizes submission stages without exposing the JSON payload', () => {
    const activity = row('1', 'snapshot_update', {
      phase: 'submitting',
      modules: [],
      submission: { stage: 'pending_inclusion' },
    });
    expect(describeDiagnosticActivity(activity)).toEqual({
      label: 'Pending Inclusion',
      detail: 'Destination transaction: Pending Inclusion',
    });
  });

  it('identifies delayed terminal reports as a follow-up relayer check', () => {
    const activity = row('1', 'snapshot_update', {
      phase: 'delivered',
      modules: [],
      submission: { stage: 'finalized' },
    });
    expect(describeDiagnosticActivity(activity)).toEqual({
      label: 'Relayer confirmed delivery',
      detail:
        'The relayer rechecked the destination mailbox after delivery and confirmed the message was processed.',
    });
  });

  it('explains successful CCIP Read verification', () => {
    const activity = row('1', 'snapshot', {
      phase: 'ready_to_submit',
      modules: [
        {
          ism: 'ccip',
          node_id: 'ccip',
          children: [],
          module_type: 'CcipRead',
          offchain_read: { state: 'succeeded', endpoint: 0, http_status: 200 },
        },
      ],
    });
    expect(describeDiagnosticActivity(activity)).toEqual({
      label: 'Validated',
      detail: 'Full verification snapshot · CCIP Read: gateway succeeded (HTTP 200)',
    });
  });
});

describe('diagnosticModuleStatus', () => {
  it('distinguishes prepared CCIP metadata from verified execution', () => {
    expect(
      diagnosticModuleStatus({
        ism: 'ccip',
        node_id: 'ccip',
        children: [],
        module_type: 'CcipRead',
        metadata_status: 'ready',
        offchain_read: { state: 'succeeded', endpoint: 0, http_status: 200 },
      }),
    ).toBe('ready');
  });

  it('keeps a pending CCIP Read request in progress', () => {
    expect(
      diagnosticModuleStatus({
        ism: 'ccip',
        node_id: 'ccip',
        children: [],
        module_type: 'CcipRead',
        offchain_read: { state: 'pending' },
      }),
    ).toBe('waiting');
  });
});

describe('snapshot boundaries and selection', () => {
  const snapshot = (activities: DiagnosticActivity[], partial = false) =>
    reduceMessageDiagnostics({ version: 1, message_id: '0x1234', partial, activities });
  const node = (node_id: string) => ({ node_id, ism: node_id, children: [] });

  it('applies each cumulative update to its actual anchor in numeric ID order', () => {
    const result = snapshot([
      row('10', 'snapshot_update', { phase: 'preparing', modules: [node('current')] }),
      row('2', 'snapshot', {
        phase: 'retrying',
        retry: { reason: 'Old retry' },
        modules: [node('root')],
      }),
      row('9', 'snapshot_update', {
        phase: 'preparing',
        modules: [node('obsolete')],
        removed_modules: ['root'],
      }),
    ]);
    expect(result.relayers[0]?.activityId).toBe('10');
    expect(result.relayers[0]?.state.modules.map((node) => node.node_id)).toEqual([
      'root',
      'current',
    ]);
    expect(result.relayers[0]?.state.retry).toBeUndefined();
  });

  it('rejects orphan updates and unsupported versions without blending reporter trees', () => {
    const second = '0x2222222222222222222222222222222222222222';
    const result = snapshot([
      row('1', 'snapshot', { phase: 'preparing', modules: [node('first')] }),
      {
        ...row('2', 'snapshot_update', { phase: 'ready_to_submit', modules: [node('second')] }),
        relayer: second,
      },
      { ...row('3', 'snapshot', { phase: 'delivered', modules: [] }), version: 2 },
    ]);
    expect(result.partial).toBe(true);
    expect(result.relayers).toHaveLength(1);
    expect(result.relayers[0]?.state.modules[0]?.node_id).toBe('first');
    expect(result.relayers[0]?.state.phase).toBe('preparing');
  });

  it('retains whole observations across partial and older responses, but respects complete removal/retry', () => {
    const previous = snapshot([
      row('90071992547409930', 'snapshot', {
        phase: 'ready_to_submit',
        modules: [node('ready')],
      }),
    ]);
    expect(reconcileDiagnosticObservations(previous, snapshot([], true)).relayers).toEqual(
      previous.relayers,
    );
    const older = snapshot([
      row('90071992547409929', 'snapshot', { phase: 'preparing', modules: [] }),
    ]);
    expect(reconcileDiagnosticObservations(previous, older)).toEqual({
      ...previous,
      partial: true,
    });
    expect(reconcileDiagnosticObservations(previous, snapshot([])).relayers).toEqual([]);
    const retry = snapshot([
      row('90071992547409931', 'snapshot', { phase: 'retrying', modules: [] }),
    ]);
    expect(reconcileDiagnosticObservations(previous, retry)).toEqual(retry);
  });

  it('selects the best current reporter, holds ties, and demotes real retries and failures', () => {
    const main = snapshot([row('999', 'snapshot', { phase: 'preparing', modules: [] })])
      .relayers[0]!;
    const fast = {
      ...main,
      relayer: 'fast',
      activityId: '1',
      state: { phase: 'ready_to_submit', modules: [] },
    };
    expect(selectRelayObservation([main, fast], main.relayer)).toBe(fast);
    const tie = { ...main, relayer: 'other' };
    expect(selectRelayObservation([tie, main], main.relayer)).toBe(main);
    const retry = {
      ...fast,
      state: { phase: 'retrying', modules: [], submission: { stage: 'mempool' } },
    };
    expect(selectRelayObservation([retry, main], fast.relayer)).toBe(main);
    const failed = {
      ...fast,
      state: { ...fast.state, failure: { stage: 'submit', reason: 'rpc_error' } },
    };
    expect(selectRelayObservation([failed, main], fast.relayer)).toBe(main);
    expect(selectRelayObservation([])).toBeUndefined();
  });

  it('keeps expected commit dependencies neutral while preserving real errors and unused paths', () => {
    const waiting = {
      phase: 'retrying',
      modules: [],
      retry: { reason: 'AwaitingIcaReveal' },
      failure: { stage: 'simulate', reason: 'contract_call_failed' },
    };
    expect(isWaitingForCommit(waiting)).toBe(true);
    expect(
      isWaitingForCommit({ ...waiting, failure: { stage: 'simulate', reason: 'rpc_timeout' } }),
    ).toBe(false);
    const failed = { ...node('candidate'), verification: 'failed' };
    expect(diagnosticModuleStatus(failed, undefined, true)).toBe('waiting');
    expect(diagnosticModuleStatus(failed, true, true)).toBe('failed');
    expect(diagnosticModuleStatus(failed, false)).toBe('unused');
    expect(
      diagnosticModuleStatus(
        { ...node('root'), metadata_error: 'Awaiting validator signatures' },
        true,
      ),
    ).toBe('waiting');
    expect(diagnosticModuleStatus({ ...node('ccip'), offchain_read: { state: 'succeeded' } })).toBe(
      'waiting',
    );
  });

  it('accepts nullable snapshot fields and legacy string-state rows', () => {
    const parsed = messageDiagnosticsSchema.parse({
      version: 1,
      message_id: '0x1234',
      partial: false,
      activities: [
        {
          ...row('1', 'snapshot', {
            phase: 'preparing',
            modules: [
              {
                ...node('root'),
                selected_children: null,
                signatures: null,
                offchain_read: null,
                checks: { merkle: null },
                validators: null,
                verified: null,
              },
            ],
          }),
          received_at: '2026-01-01T00:00:01Z',
        },
        {
          id: '2',
          relayer,
          observed_at: 'now',
          activity: { type: 'offchain_read', state: 'succeeded' },
        },
      ],
    });
    expect(parsed.activities).toHaveLength(2);
    expect(snapshot(parsed.activities).relayers[0]?.state.phase).toBe('preparing');
    expect(messageDiagnosticsSchema.safeParse({ ...parsed, version: 2 }).success).toBe(false);
  });

  it('keeps bounded, deduplicated activity history across pages and head refreshes', () => {
    const old = Array.from({ length: 1000 }, (_, index) =>
      row(String(index + 1), 'snapshot', { phase: 'preparing', modules: [] }),
    );
    const newest = row('1001', 'snapshot', { phase: 'ready_to_submit', modules: [] });
    const updated = row('1000', 'snapshot', { phase: 'submitting', modules: [] });
    const merged = mergeActivityHistory(old, [newest, updated]);
    expect(merged).toHaveLength(1000);
    expect(merged[0]).toEqual(newest);
    expect(merged[1]).toEqual(updated);
    expect(merged.at(-1)?.id).toBe('2');
  });
});
