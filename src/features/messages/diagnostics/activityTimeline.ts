import { MessageStatus, type MessageStub } from '../../../types';
import {
  getMessageTimeline,
  hasPassedValidation,
  parseObservationTime,
  validTime,
} from './timeline';
import {
  describeDiagnosticActivity,
  diagnosticLabel,
  isOffchainAttestationPending,
  mergeDiagnosticState,
  type DiagnosticActivity,
  type DiagnosticModule,
  type DiagnosticState,
  type LifecycleStepStatus,
  type RelayerDiagnosticState,
} from './types';
import { normalizeValidatorAddress } from './validatorSignatures';

export interface TimelineEntry {
  id: string;
  kind:
    | 'dispatch'
    | 'pickup'
    | 'signature'
    | 'security'
    | 'validation'
    | 'submission'
    | 'activity'
    | 'delivery';
  title: string;
  summary?: string;
  detail: string;
  /** Event/observation time used for timeline ordering and elapsed intervals. */
  timestamp?: number;
  /** Logical placement only; never display this value or use it for elapsed time. */
  orderTimestamp?: number;
  /** Chain header timestamp, separate from a relayer observation of that block. */
  blockTimestamp?: number;
  /** Preserve the original observation's precision for expanded details. */
  timestampRaw?: string;
  timeSource?: 'chain' | 'relayer';
  status: LifecycleStepStatus;
  relayer?: string;
  validator?: string;
  signatureModule?: string;
  signatureGroup?: string;
  signatureThreshold?: number | null;
  /** Current-step semantics when a sparse history has no corresponding raw row. */
  phase?: string;
  submissionStage?: string;
  /** Original database records, including every collapsed report. */
  rows: DiagnosticActivity[];
  /** Number of reports, never an inferred number of retry attempts. */
  repeatCount: number;
  endTimestamp?: number;
}

interface TimelineOptions {
  message: MessageStub;
  observation?: RelayerDiagnosticState;
  activities: DiagnosticActivity[];
}

interface Report {
  row: DiagnosticActivity;
  state?: DiagnosticState;
  partial: boolean;
  /** Comparison only: omitted nodes are unknown when the anchor is not loaded. */
  fingerprintModules?: DiagnosticModule[];
}

/** Recorded timestamps determine chronology. Missing timestamps are kept unknown. */
export function buildMessageActivityTimeline({
  message,
  observation,
  activities,
}: TimelineOptions): TimelineEntry[] {
  const selectedRows = observation
    ? [...new Map(activities.map((row) => [row.id, row])).values()]
        .filter(
          (row) =>
            row.relayer === observation.relayer && BigInt(row.id) <= BigInt(observation.activityId),
        )
        .sort(compareIds)
    : [];
  const reports = reconstructReports(selectedRows);
  const supportedRows = selectedRows.filter(isSupported);
  const stages = getMessageTimeline(message, observation, supportedRows).stages;
  const pickedUp = stages.find((stage) => stage.id === 'picked_up');
  const delivered = message.status === MessageStatus.Delivered;
  const working =
    [MessageStatus.Pending, MessageStatus.Failing].includes(message.status) &&
    !['dropped', 'delivered'].includes(observation?.state.phase ?? '');
  // Inclusion may belong to a failed attempt or another transaction, not this delivery.
  const deliveryObservation = firstDeliveryObservation(reports, observation);
  const deliveryBlockTime = delivered ? validTime(message.destination?.timestamp) : undefined;
  const deliveryOrderTime = delivered
    ? (deliveryObservation?.timestamp ?? deliveryBlockTime)
    : undefined;
  const entries: TimelineEntry[] = [
    {
      ...milestone(
        'dispatch',
        'Dispatched',
        'Origin transaction block timestamp. A block timestamp is not the wall-clock time the network or relayer received the block.',
        'complete',
        validTime(message.origin.timestamp),
      ),
      blockTimestamp: validTime(message.origin.timestamp),
    },
    {
      ...milestone(
        'pickup',
        'Picked up by relayer',
        'The selected relayer’s recorded first-seen time. Pickup can precede the configured origin confirmation threshold.',
        observation ? 'complete' : working ? 'active' : 'pending',
        pickedUp?.timestamp,
      ),
      timeSource: 'relayer',
      relayer: observation?.relayer,
    },
  ];

  const seenSignatures = new Set<string>();
  const reportGroups = new Map<string, { fingerprint: string; index: number }>();
  let previousReport: Report | undefined;
  for (const [index, report] of reports.entries()) {
    const { row, state } = report;
    const timestamp = parseObservationTime(row.observed_at);
    const signatureEntries = signatureEvents(report, seenSignatures, timestamp);
    entries.push(...signatureEntries);
    // Keep phase/failure transitions, but a signature row already contains its raw
    // snapshot and fully describes an otherwise unchanged signature collection.
    const signatureOnly =
      signatureEntries.length > 0 &&
      (!state ||
        (previousReport !== undefined &&
          reportFingerprint(report, true) === reportFingerprint(previousReport, true)));
    if (!signatureOnly) {
      const description = describeDiagnosticActivity(
        state ? { ...row, activity: { ...row.activity, state } } : row,
      );
      const phase = state?.phase;
      const completedModules = newlyCompletedModules(state, previousReport?.state);
      const progressTitle = completedModules.some((module) => module.node_id === state?.tree_root)
        ? 'Security requirements satisfied'
        : completedModules.length > 1
          ? `${completedModules.length} security modules ready`
          : completedModules.length === 1
            ? `${diagnosticLabel(completedModules[0].module_type ?? 'Security module')} ${completedModules[0].verification === 'succeeded' ? 'verified' : 'ready'}`
            : description.label;
      const kind =
        phase === 'ready_to_submit'
          ? 'validation'
          : phase === 'submitting' || phase === 'confirming'
            ? 'submission'
            : completedModules.length
              ? 'security'
              : 'activity';
      const preciseTime =
        phase === 'delivered'
          ? validTime(state?.delivered_observed_at_millis)
          : kind === 'submission'
            ? validTime(state?.submission?.observed_at_millis)
            : kind === 'validation'
              ? validTime(state?.phase_started_at_millis)
              : undefined;
      const entry: TimelineEntry = {
        id: `activity:${row.id}`,
        kind,
        title: isSupported(row)
          ? phase === 'delivered'
            ? 'Relayer rechecked delivery'
            : progressTitle
          : 'Unrecognized relayer update',
        summary: completedModules.length ? 'Security verification progressed' : undefined,
        detail: isSupported(row)
          ? phase === 'delivered'
            ? 'The relayer rechecked the destination mailbox and confirmed the message was processed. This scheduled delivery recheck can occur well after inclusion; it is not a chain-finality observation.'
            : description.detail
          : 'This record uses an unsupported diagnostics version. Its raw data is available below.',
        timestamp: preciseTime ?? timestamp,
        timestampRaw:
          preciseTime === undefined ? row.observed_at : new Date(preciseTime).toISOString(),
        timeSource: 'relayer',
        status: phase === 'dropped' || state?.failure ? 'failed' : 'complete',
        relayer: row.relayer,
        rows: [row],
        repeatCount: 1,
      };
      entries.push(entry);
      reportGroups.set(entry.id, { fingerprint: reportFingerprint(report), index });
    }
    previousReport = report;
  }

  // The current observation may include unchanged nodes from an anchor outside
  // the loaded pages, even when its update row is present. It proves a signature
  // exists, not when it was first collected. Never fabricate a history row.
  if (observation) {
    const timestamp = parseObservationTime(observation.observedAt);
    entries.push(
      ...moduleSignatureEvents(
        observation.state.modules,
        seenSignatures,
        observation.relayer,
        observation.activityId,
        timestamp,
        observation.observedAt,
        [],
      ),
    );
  }

  if (!entries.some((entry) => entry.kind === 'validation')) {
    entries.push({
      ...milestone(
        'validation',
        'Validated',
        'Verification data prepared for the destination security module. An exact validation time is shown only when recorded.',
        hasPassedValidation(observation?.state) || (!observation && delivered)
          ? 'complete'
          : observation?.state.phase === 'dropped'
            ? 'failed'
            : 'pending',
      ),
      relayer: observation?.relayer,
      timeSource: 'relayer',
    });
  }
  entries.push({
    ...milestone(
      'delivery',
      'Delivered',
      !delivered
        ? 'Awaiting indexed proof of destination execution. Transaction inclusion alone does not prove this message executed.'
        : deliveryObservation
          ? 'The selected relayer observed mailbox delivery. This is an upper bound on when delivery became visible. The destination block timestamp is shown separately.'
          : 'The message was executed on the destination. When available, the time shown is the destination block timestamp. The selected relayer has not recorded a mailbox delivery observation; its delivery recheck can occur later.',
      delivered
        ? 'complete'
        : working && hasPassedValidation(observation?.state)
          ? 'active'
          : 'pending',
      delivered ? (deliveryObservation?.timestamp ?? deliveryBlockTime) : undefined,
    ),
    summary: !delivered
      ? undefined
      : deliveryObservation
        ? 'Destination execution observed by relayer'
        : deliveryBlockTime !== undefined
          ? 'Destination block time · relayer observation unavailable'
          : 'Destination execution recorded; timing unavailable',
    blockTimestamp: deliveryBlockTime,
    orderTimestamp: !deliveryObservation ? deliveryOrderTime : undefined,
    timestampRaw: delivered ? deliveryObservation?.timestampRaw : undefined,
    timeSource: deliveryObservation || !delivered ? 'relayer' : 'chain',
    relayer: observation?.relayer,
    rows: delivered && deliveryObservation?.row ? [deliveryObservation.row] : [],
  });
  entries.sort((a, b) => {
    const aTime = a.orderTimestamp ?? a.timestamp;
    const bTime = b.orderTimestamp ?? b.timestamp;
    if (aTime === undefined) return bTime === undefined ? 0 : 1;
    if (bTime === undefined) return -1;
    return aTime - bTime || timelineRank(a.kind) - timelineRank(b.kind);
  });
  // Number individual signatures in displayed order, including batches first seen together.
  const signatureCounts = new Map<string, number>();
  for (const entry of entries) {
    if (!entry.signatureGroup) continue;
    const count = (signatureCounts.get(entry.signatureGroup) ?? 0) + 1;
    signatureCounts.set(entry.signatureGroup, count);
    entry.title = `Signature observed${entry.signatureThreshold == null ? '' : ` (${count}/${entry.signatureThreshold})`}`;
  }
  const grouped: TimelineEntry[] = [];
  let previousGroup: { fingerprint: string; index: number } | undefined;
  for (const entry of entries) {
    const group = reportGroups.get(entry.id);
    const previous = grouped[grouped.length - 1];
    // Group after chronological ordering so a chain or signer milestone always
    // splits the range. Also require adjacency in the source reports: out-of-order
    // clocks must not hide an intervening change to the relayer's state.
    if (
      group &&
      previousGroup &&
      previous &&
      group.fingerprint === previousGroup.fingerprint &&
      group.index === previousGroup.index + 1 &&
      entry.timestamp !== undefined &&
      previous.timestamp !== undefined &&
      entry.timestamp >= (previous.endTimestamp ?? previous.timestamp)
    ) {
      previous.rows.push(...entry.rows);
      previous.repeatCount += entry.repeatCount;
      previous.endTimestamp = entry.timestamp;
    } else {
      grouped.push(entry);
    }
    previousGroup = group;
  }
  markCurrentStep(grouped, observation, message.status);
  return grouped;
}

/** Historical facts stay complete; only the selected relayer's current work animates. */
function markCurrentStep(
  entries: TimelineEntry[],
  observation: RelayerDiagnosticState | undefined,
  messageStatus: MessageStatus,
) {
  if (!observation || ![MessageStatus.Pending, MessageStatus.Failing].includes(messageStatus))
    return;
  const { state } = observation;
  const phase = state.phase;
  if (
    !phase ||
    !['preparing', 'awaiting_signatures', 'retrying', 'submitting', 'confirming'].includes(phase)
  )
    return;
  // Inclusion/finality are completed observations. Awaiting indexed execution is
  // represented by the active delivery milestone, rather than animating a fact.
  if (phase === 'confirming' && ['included', 'finalized'].includes(state.submission?.stage ?? ''))
    return;
  const submissionPhase = phase === 'submitting' || phase === 'confirming';
  const candidates = entries
    .flatMap((entry) =>
      entry.kind === 'activity' || entry.kind === 'submission'
        ? entry.rows
            .filter(
              (row) =>
                isSupported(row) &&
                row.activity.state?.phase === phase &&
                (submissionPhase
                  ? row.activity.state.submission?.stage === state.submission?.stage
                  : row.activity.state.retry?.reason === state.retry?.reason),
            )
            .map((row) => ({ id: row.id, entry }))
        : [],
    )
    .sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : BigInt(a.id) > BigInt(b.id) ? 1 : 0));
  const current = (
    candidates.find((candidate) => candidate.id === observation.activityId) ??
    candidates[candidates.length - 1]
  )?.entry;
  if (current) current.status = 'active';
  else {
    const nextKind = hasPassedValidation(state) || submissionPhase ? 'delivery' : 'validation';
    const nextIndex = entries.findIndex((entry) => entry.kind === nextKind);
    entries.splice(nextIndex < 0 ? entries.length : nextIndex, 0, {
      id: 'current_activity',
      kind: submissionPhase ? 'submission' : 'activity',
      title: diagnosticLabel(submissionPhase ? (state.submission?.stage ?? phase) : phase),
      detail:
        'The selected relayer is currently at this step. Its start time is not available in the loaded history.',
      status: 'active',
      timeSource: 'relayer',
      relayer: observation.relayer,
      phase,
      submissionStage: state.submission?.stage,
      rows: [],
      repeatCount: 1,
    });
  }
  // Current work already has an active row; destination execution is next.
  const delivery = entries.find((entry) => entry.kind === 'delivery');
  if (delivery) delivery.status = 'pending';
}

function milestone(
  kind: TimelineEntry['kind'],
  title: string,
  detail: string,
  status: LifecycleStepStatus,
  timestamp?: number,
): TimelineEntry {
  return {
    id: kind,
    kind,
    title,
    detail,
    status,
    timestamp,
    timeSource: 'chain',
    rows: [],
    repeatCount: 1,
  };
}

function isSupported(row: DiagnosticActivity) {
  return row.version === undefined || row.version === 1;
}

function timelineRank(kind: TimelineEntry['kind']) {
  return [
    'dispatch',
    'pickup',
    'signature',
    'security',
    'activity',
    'validation',
    'submission',
    'delivery',
  ].indexOf(kind);
}

function firstDeliveryObservation(reports: Report[], current: RelayerDiagnosticState | undefined) {
  const candidates: Array<{
    state: DiagnosticState;
    row?: DiagnosticActivity;
  }> = reports.flatMap(({ state, row }) => (state ? [{ state, row }] : []));
  if (current) candidates.push({ state: current.state });
  let earliest:
    | {
        timestamp: number;
        timestampRaw: string;
        row?: DiagnosticActivity;
      }
    | undefined;
  for (const candidate of candidates) {
    const { state, row } = candidate;
    // A delayed delivered-phase report alone cannot recover the mailbox read time.
    const timestamp = validTime(state.delivered_observed_at_millis);
    if (timestamp !== undefined && (!earliest || timestamp < earliest.timestamp)) {
      earliest = {
        timestamp,
        timestampRaw: new Date(timestamp).toISOString(),
        row,
      };
    }
  }
  return earliest;
}

function newlyCompletedModules(state?: DiagnosticState, previous?: DiagnosticState) {
  if (
    !state ||
    !previous ||
    state.phase !== previous.phase ||
    !['preparing', 'awaiting_signatures'].includes(state.phase ?? '')
  )
    return [];
  return state.modules.filter((module) => {
    const before = previous.modules.find((item) => item.node_id === module.node_id);
    return (
      (module.verification === 'succeeded' && before?.verification !== 'succeeded') ||
      (module.metadata_status === 'ready' && before?.metadata_status !== 'ready')
    );
  });
}

function reconstructReports(rows: DiagnosticActivity[]): Report[] {
  let anchor: DiagnosticState | undefined;
  const knownModules = new Map<string, DiagnosticModule>();
  return rows.map((row) => {
    if (!isSupported(row)) return { row, partial: true };
    const state = row.activity.state;
    if (row.activity.type === 'snapshot') {
      anchor = state;
      return { row, state, partial: !state };
    }
    if (row.activity.type !== 'snapshot_update' || !state) return { row, partial: true };
    if (!anchor) {
      // Cumulative updates may omit nodes restored to their unknown anchor values.
      // Retain known nodes only for grouping; never use them to invent history,
      // signatures, or a reconstructed state without the actual anchor.
      state.removed_modules?.forEach((nodeId) => knownModules.delete(nodeId));
      state.modules.forEach((module) => knownModules.set(module.node_id, module));
      return { row, state, partial: true, fingerprintModules: [...knownModules.values()] };
    }
    return { row, state: mergeDiagnosticState(anchor, state), partial: false };
  });
}

function signatureEvents(report: Report, seen: Set<string>, timestamp?: number): TimelineEntry[] {
  const { row, state } = report;
  if (!isSupported(row)) return [];
  if (state)
    return moduleSignatureEvents(
      state.modules,
      seen,
      row.relayer,
      row.id,
      timestamp,
      row.observed_at,
      [row],
    );
  const observation = row.activity.observation;
  if (
    row.activity.type !== 'checkpoint' ||
    !observation ||
    typeof observation !== 'object' ||
    !('type' in observation) ||
    observation.type !== 'signature' ||
    !('validator' in observation) ||
    typeof observation.validator !== 'string' ||
    !('index' in observation) ||
    typeof observation.index !== 'number' ||
    !('root' in observation) ||
    typeof observation.root !== 'string'
  )
    return [];
  const ismId = typeof row.activity.ism === 'string' ? row.activity.ism : 'unknown';
  const key = `${row.relayer}:${ismId}:${observation.index}:${observation.root}:${addressKey(observation.validator)}`;
  if (seen.has(key)) return [];
  seen.add(key);
  return [
    {
      id: `signature:${row.id}:${key}`,
      kind: 'signature',
      title: 'Signature observed',
      detail: `Relayer reported collecting a signature for checkpoint ${observation.index}. This is the relayer’s observation time, not the validator’s signing or upload time.`,
      timestamp,
      timestampRaw: row.observed_at,
      timeSource: 'relayer',
      status: 'complete',
      relayer: row.relayer,
      validator: observation.validator,
      rows: [row],
      repeatCount: 1,
    },
  ];
}

function moduleSignatureEvents(
  modules: DiagnosticModule[],
  seen: Set<string>,
  relayer: string,
  activityId: string,
  timestamp: number | undefined,
  timestampRaw: string,
  rows: DiagnosticActivity[],
): TimelineEntry[] {
  const entries: TimelineEntry[] = [];
  for (const securityModule of modules) {
    const signatures = securityModule.signatures;
    if (!signatures) continue;
    for (const signer of signatures.signers) {
      const group = `${relayer}:${securityModule.node_id}:${signatures.index ?? '?'}:${signatures.root ?? '?'}`;
      const key = `${group}:${addressKey(signer.validator)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      entries.push({
        id: `signature:${activityId}:${key}`,
        kind: 'signature',
        title: 'Signature observed',
        summary: `${diagnosticLabel(securityModule.module_type ?? 'Security module')}${signatures.index == null ? '' : ` · checkpoint ${signatures.index}`}`,
        detail: `First available relayer report containing this signature${signatures.index == null ? '' : ` for checkpoint ${signatures.index}`}. ${signatures.signers.length}${signatures.threshold == null ? '' : ` / ${signatures.threshold}`} signatures reported for this security module. The signature existed by this time; its actual signing and upload times are not recorded.`,
        timestamp,
        timestampRaw,
        timeSource: 'relayer',
        status: 'complete',
        relayer,
        validator: signer.validator,
        signatureModule: securityModule.ism,
        signatureGroup: group,
        signatureThreshold: signatures.threshold,
        rows,
        repeatCount: 1,
      });
    }
  }
  return entries;
}

function reportFingerprint(
  { row, state, partial, fingerprintModules }: Report,
  omitSignatureProgress = false,
) {
  if (!state) return `${row.version}:${stableJson(row.activity)}`;
  return stableJson({
    partial,
    phase: state.phase,
    tree_root: state.tree_root,
    retry: state.retry?.reason,
    failure: state.failure,
    submission: state.submission?.stage,
    removed_modules: partial ? [...(state.removed_modules ?? [])].sort() : undefined,
    modules: [...(fingerprintModules ?? state.modules)]
      .sort((a, b) => a.node_id.localeCompare(b.node_id))
      .map((module) => ({
        // Request bookkeeping (selected_children, latest_indices, discovery
        // attempts, storage URLs) can change on every retry without new progress.
        // Group by visible security/progress semantics; retain all raw records.
        node_id: module.node_id,
        ism: module.ism,
        type: module.module_type,
        children: module.children.map((child) => child.node_id).sort(),
        validators: module.validators?.map(addressKey).sort(),
        threshold: module.threshold ?? null,
        verified: module.verified ?? null,
        verification:
          module.verification === 'succeeded' || module.verification === 'failed'
            ? module.verification
            : null,
        metadata_error: module.metadata_error ?? null,
        metadata_status: module.metadata_status ?? null,
        failed_checks: Object.entries(module.checks ?? {})
          .filter(([, value]) => value === 'failed')
          .map(([check]) => check)
          .sort(),
        // Pending responses and exhausted per-attempt retries are the same wait.
        offchain_read: module.offchain_read
          ? isOffchainAttestationPending(module)
            ? { state: 'pending' }
            : {
                state: module.offchain_read.state,
                http_status: module.offchain_read.http_status ?? null,
              }
          : null,
        signatures:
          !omitSignatureProgress && module.signatures
            ? {
                index: module.signatures.index ?? null,
                root: module.signatures.root ?? null,
                threshold: module.signatures.threshold ?? null,
                signers: module.signatures.signers
                  .map((signer) => addressKey(signer.validator))
                  .sort(),
                rejected: module.signatures.unavailable
                  .filter((entry) =>
                    ['invalid_signature', 'signer_mismatch', 'index_mismatch'].includes(
                      entry.reason ?? '',
                    ),
                  )
                  .map((entry) => ({
                    validator: addressKey(entry.validator),
                    reason: entry.reason,
                  }))
                  .sort((a, b) => a.validator.localeCompare(b.validator)),
              }
            : undefined,
      })),
  });
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${JSON.stringify(key)}:${stableJson(value)}`)
      .join(',')}}`;
  return JSON.stringify(value) ?? 'undefined';
}

function addressKey(address: string) {
  return normalizeValidatorAddress(address) ?? address;
}

function compareIds(a: DiagnosticActivity, b: DiagnosticActivity) {
  return BigInt(a.id) < BigInt(b.id) ? -1 : BigInt(a.id) > BigInt(b.id) ? 1 : 0;
}
