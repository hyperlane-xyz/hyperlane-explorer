import { z } from 'zod';

const count = z.number().int().nonnegative();

const diagnosticChildSchema = z.object({
  ism: z.string(),
  node_id: z.string(),
});

const unavailableValidatorSchema = z.object({
  validator: z.string(),
  reason: z.string().nullish(),
});

const signaturesSchema = z.object({
  collected: count.nullish(),
  threshold: count.nullish(),
  index: count.nullish(),
  root: z.string().nullish(),
  unavailable: z
    .array(unavailableValidatorSchema)
    .nullish()
    .transform((value) => value ?? []),
  discovery_unavailable: z.array(unavailableValidatorSchema).nullish(),
  latest_indices: z.array(z.object({ validator: z.string(), index: count.nullish() })).nullish(),
});

const offchainReadSchema = z
  .object({
    state: z.string(),
    attempt: count.nullish(),
    endpoint: z.number().nullable().optional(),
    http_status: z.number().nullable().optional(),
  })
  .passthrough();

export const diagnosticModuleSchema = z
  .object({
    ism: z.string(),
    node_id: z.string(),
    children: z.array(diagnosticChildSchema).default([]),
    selected_children: z.array(z.string()).nullish(),
    discovered: z.boolean().optional(),
    module_type: z.string().nullable().optional(),
    metadata_status: z.string().nullish(),
    metadata_error: z.string().nullable().optional(),
    verification: z.string().nullable().optional(),
    verified: count.nullish(),
    threshold: z.number().nullable().optional(),
    validators: z.array(z.string()).nullish(),
    signatures: signaturesSchema.nullish(),
    offchain_read: offchainReadSchema.nullish(),
    checks: z.record(z.string(), z.string().nullish()).nullish(),
  })
  .passthrough();

const retrySchema = z
  .object({
    reason: z.string().nullable().optional(),
    count: z.union([z.number(), z.string()]).optional(),
    next_attempt_at_millis: z.number().nullable().optional(),
  })
  .passthrough();

const failureSchema = z
  .object({
    stage: z.string().optional(),
    reason: z.string().optional(),
  })
  .passthrough();

const submissionSchema = z
  .object({
    stage: z.string(),
    observed_at_millis: count.nullish(),
  })
  .passthrough();

export const diagnosticStateSchema = z
  .object({
    phase: z.string().optional(),
    retry: retrySchema.nullable().optional(),
    failure: failureSchema.nullable().optional(),
    submission: submissionSchema.nullable().optional(),
    tree_root: z.string().nullable().optional(),
    modules: z.array(diagnosticModuleSchema).default([]),
    removed_modules: z.array(z.string()).optional(),
    relayer_first_seen_at_millis: count.nullish(),
    phase_started_at_millis: count.nullish(),
    delivered_observed_at_millis: count.nullish(),
  })
  .passthrough();

export const diagnosticActivitySchema = z.object({
  id: z.string().regex(/^\d+$/),
  version: z.number().optional(),
  message_id: z.string().optional(),
  relayer: z.string(),
  observed_at: z.string(),
  received_at: z.string().optional(),
  activity: z
    .object({
      type: z.string(),
      // Legacy event rows use a string state; only snapshots carry a proof tree.
      state: z.preprocess(
        (value) => (typeof value === 'string' ? undefined : value),
        diagnosticStateSchema.optional(),
      ),
    })
    .passthrough(),
});

export const messageDiagnosticsSchema = z.object({
  version: z.literal(1),
  message_id: z.string(),
  partial: z.boolean(),
  activities: z.array(diagnosticActivitySchema),
});

export const messageActivityPageSchema = z.object({
  message_id: z.string(),
  has_more: z.boolean(),
  next_before_id: z.string().nullable(),
  activities: z.array(diagnosticActivitySchema),
});

export type DiagnosticModule = z.infer<typeof diagnosticModuleSchema>;
export type DiagnosticState = z.infer<typeof diagnosticStateSchema>;
export type DiagnosticActivity = z.infer<typeof diagnosticActivitySchema>;
export type MessageDiagnostics = z.infer<typeof messageDiagnosticsSchema>;
export type MessageActivityPage = z.infer<typeof messageActivityPageSchema>;

export interface RelayerDiagnosticState {
  relayer: string;
  observedAt: string;
  activityId: string;
  state: DiagnosticState;
}

export type LifecycleStepStatus = 'complete' | 'active' | 'pending' | 'failed';

export interface DiagnosticObservations {
  partial: boolean;
  relayers: RelayerDiagnosticState[];
}

export function normalizeDiagnosticMessageId(value: string) {
  return value.replace(/^(?:0x|\\x)/, '').toLowerCase();
}

/** Cumulative updates replace message state and apply changed nodes to their original anchor. */
export function reduceMessageDiagnostics(diagnostics: MessageDiagnostics): DiagnosticObservations {
  const anchors = new Map<string, DiagnosticState>();
  const relayers = new Map<string, RelayerDiagnosticState>();
  let partial = diagnostics.partial;
  for (const row of [...diagnostics.activities].sort(compareActivityIds)) {
    if (row.version != null && row.version !== 1) {
      partial = true;
      continue;
    }
    if (!['snapshot', 'snapshot_update'].includes(row.activity.type)) continue;
    const update = row.activity.state;
    if (!update) {
      partial = true;
      continue;
    }
    let state = update;
    if (row.activity.type === 'snapshot') anchors.set(row.relayer, state);
    else {
      const anchor = anchors.get(row.relayer);
      if (!anchor) {
        partial = true;
        continue;
      }
      state = mergeDiagnosticState(anchor, update);
    }
    relayers.set(row.relayer, {
      relayer: row.relayer,
      observedAt: row.observed_at,
      activityId: row.id,
      state,
    });
  }
  return { partial, relayers: [...relayers.values()].sort(compareRelayers) };
}

function mergeDiagnosticState(anchor: DiagnosticState, update: DiagnosticState): DiagnosticState {
  const modules = new Map(anchor.modules.map((module) => [module.node_id, module]));
  update.removed_modules?.forEach((nodeId) => modules.delete(nodeId));
  update.modules.forEach((module) => modules.set(module.node_id, module));
  // The producer sends complete message-level state, including explicit invalidations.
  return { ...update, modules: [...modules.values()] };
}

/** Retain whole observations across partial/older responses, never merge trees across envelopes. */
export function reconcileDiagnosticObservations(
  previous: DiagnosticObservations | undefined,
  next: DiagnosticObservations,
): DiagnosticObservations {
  if (!previous) return next;
  const relayers = new Map(next.relayers.map((relay) => [relay.relayer, relay]));
  let partial = next.partial;
  for (const relay of previous.relayers) {
    const incoming = relayers.get(relay.relayer);
    if (
      (!incoming && next.partial) ||
      (incoming && BigInt(incoming.activityId) < BigInt(relay.activityId))
    ) {
      relayers.set(relay.relayer, relay);
      partial = true;
    }
  }
  return { partial, relayers: [...relayers.values()].sort(compareRelayers) };
}

function compareActivityIds(a: { id: string }, b: { id: string }) {
  return BigInt(a.id) < BigInt(b.id) ? -1 : BigInt(a.id) > BigInt(b.id) ? 1 : 0;
}
function compareRelayers(a: RelayerDiagnosticState, b: RelayerDiagnosticState) {
  return a.relayer.localeCompare(b.relayer);
}

export function isWaitingForCommit(state?: DiagnosticState) {
  return (
    state?.phase === 'retrying' &&
    state.retry?.reason === 'AwaitingIcaReveal' &&
    (!state.failure ||
      (state.failure.stage === 'simulate' && state.failure.reason === 'contract_call_failed'))
  );
}

const pendingOffchainReadStates = new Set(['pending', 'pending_retries_exhausted']);

export function isOffchainAttestationPending(module: DiagnosticModule) {
  return pendingOffchainReadStates.has(module.offchain_read?.state ?? '');
}

export function isWaitingForOffchainAttestation(state?: DiagnosticState) {
  return state?.modules.some(isOffchainAttestationPending) ?? false;
}

export function offchainReadLabel(state: string) {
  if (state === 'pending') return 'Waiting for offchain attestation';
  if (state === 'pending_retries_exhausted')
    return 'Offchain attestation is still pending after the latest gateway checks';
  return `Gateway: ${diagnosticLabel(state)}`;
}

const phaseRank: Record<string, number> = {
  retrying: 1,
  preparing: 2,
  awaiting_signatures: 2,
  ready_to_submit: 3,
  submitting: 4,
  confirming: 5,
  delivered: 6,
};
function relayRank(state: DiagnosticState) {
  if (isWaitingForCommit(state)) return phaseRank.preparing;
  if (state.failure) return 0;
  return phaseRank[state.phase ?? ''] ?? 0;
}
export function selectRelayObservation(
  relayers: RelayerDiagnosticState[],
  preferredRelayer?: string,
) {
  let selected = relayers.find((relay) => relay.relayer === preferredRelayer) ?? relayers[0];
  for (const relay of relayers) {
    if (!selected || relayRank(relay.state) > relayRank(selected.state)) selected = relay;
  }
  return selected;
}

export function mergeActivityHistory(previous: DiagnosticActivity[], next: DiagnosticActivity[]) {
  const rows = new Map(previous.map((row) => [row.id, row]));
  next.forEach((row) => rows.set(row.id, row));
  return [...rows.values()].sort((a, b) => compareActivityIds(b, a)).slice(0, 1000);
}

export function diagnosticModuleStatus(
  module: DiagnosticModule,
  selected?: boolean,
  preparing = false,
): 'verified' | 'ready' | 'unused' | 'waiting' | 'failed' | 'unknown' {
  if (selected === false) return 'unused';
  if (module.verification === 'succeeded') return 'verified';
  const failure = preparing && selected === undefined ? 'waiting' : 'failed';
  if (
    module.verification === 'failed' ||
    Object.values(module.checks ?? {}).includes('failed') ||
    module.offchain_read?.state === 'failed'
  )
    return failure;
  const waitingForMetadata =
    module.metadata_error === 'Awaiting validator signatures' ||
    module.metadata_error === 'Could not fetch metadata' ||
    /^Aggregation threshold not met \(\d+\)$/.test(module.metadata_error ?? '');
  if (module.metadata_error && !waitingForMetadata) return failure;
  if (waitingForMetadata || module.metadata_status === 'blocked') return 'waiting';
  if (
    module.metadata_status === 'ready' ||
    (module.module_type === 'Aggregation' &&
      module.threshold != null &&
      module.threshold > 0 &&
      module.verified != null &&
      module.verified >= module.threshold)
  )
    return 'ready';
  if (module.discovered === false) return 'unknown';
  return 'waiting';
}

export function diagnosticLabel(value?: string | null) {
  if (!value) return 'Unknown';
  const knownLabels: Record<string, string> = {
    CcipRead: 'CCIP Read',
    MessageIdMultisig: 'Message ID multisig',
    MerkleRootMultisig: 'Merkle root multisig',
  };
  if (knownLabels[value]) return knownLabels[value];
  return value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split('_')
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`)
    .join(' ');
}

export function describeDiagnosticActivity(row: DiagnosticActivity) {
  const state = row.activity.state;
  if (!state) return { label: diagnosticLabel(row.activity.type), detail: 'Relayer update' };

  const submission = ['submitting', 'confirming'].includes(state.phase ?? '')
    ? state.submission
    : undefined;
  const label = isWaitingForCommit(state)
    ? 'Waiting for commit confirmation'
    : state.phase === 'ready_to_submit'
      ? 'Validated'
      : state.phase === 'delivered'
        ? 'Relayer confirmed delivery'
        : diagnosticLabel(submission?.stage ?? state.phase ?? row.activity.type);
  const details: string[] = [];
  if (state.phase === 'delivered')
    details.push(
      'The relayer rechecked the destination mailbox after delivery and confirmed the message was processed.',
    );
  if (row.activity.type === 'snapshot') details.push('Full verification snapshot');
  details.push(...state.modules.map(describeDiagnosticModule));
  if (submission?.stage) {
    details.push(`Destination transaction: ${diagnosticLabel(submission.stage)}`);
  }
  if (state.retry?.reason) details.push(`Retry: ${diagnosticLabel(state.retry.reason)}`);
  if (state.failure?.reason) details.push(state.failure.reason);
  if (!details.length && state.phase)
    details.push(`Relayer phase: ${diagnosticLabel(state.phase)}`);
  return { label, detail: details.join(' · ') };
}

function describeDiagnosticModule(module: DiagnosticModule) {
  const label = diagnosticLabel(module.module_type ?? 'Security module');
  if (module.offchain_read?.state === 'succeeded') {
    return `${label}: gateway succeeded${module.offchain_read.http_status ? ` (HTTP ${module.offchain_read.http_status})` : ''}`;
  }
  if (module.offchain_read) {
    return `${label}: ${offchainReadLabel(module.offchain_read.state)}`;
  }
  if (module.metadata_error) return `${label}: ${module.metadata_error}`;
  if (module.signatures) {
    return `${label}: ${module.signatures.collected}/${module.signatures.threshold} signatures`;
  }
  if (module.verified != null && module.threshold != null) {
    return `${label}: ${module.verified}/${module.threshold} checks passed`;
  }
  if (module.metadata_status)
    return `${label}: proof data ${diagnosticLabel(module.metadata_status)}`;
  return `${label} updated`;
}
