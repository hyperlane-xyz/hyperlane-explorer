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
  /** True only after every retained history page has been loaded. */
  historyComplete?: boolean;
}

interface Report {
  row: DiagnosticActivity;
  state?: DiagnosticState;
  partial: boolean;
}

/** Recorded timestamps determine chronology. Missing timestamps are kept unknown. */
export function buildMessageActivityTimeline({
  message,
  observation,
  activities,
  historyComplete = false,
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
  const milestones = new Set<string>();
  let previousState: DiagnosticState | undefined;
  for (const report of reports) {
    const { row, state } = report;
    const observedAt = parseObservationTime(row.observed_at);
    // Snapshot membership proves existence, not first collection. Until history is
    // complete, never assign an arbitrary later snapshot's time to a signature.
    const timestamp = historyComplete ? observedAt : undefined;
    entries.push(...signatureEvents(report, seenSignatures, timestamp));
    if (!isSupported(row)) continue;
    if (!state) continue;

    const add = (
      key: string,
      kind: TimelineEntry['kind'],
      title: string,
      detail: string,
      time = timestamp,
      status: LifecycleStepStatus = 'complete',
    ) => {
      if (milestones.has(key)) return;
      milestones.add(key);
      entries.push({
        id: `${key}:${row.id}`,
        kind,
        title,
        detail,
        timestamp: time,
        timestampRaw: time === undefined ? undefined : new Date(time).toISOString(),
        timeSource: 'relayer',
        status,
        relayer: row.relayer,
        rows: [row],
        repeatCount: 1,
        phase: state.phase,
        submissionStage: state.submission?.stage,
      });
    };

    for (const securityModule of state.modules) {
      const signatures = securityModule.signatures;
      const identity = `${securityModule.node_id}:${signatures?.index ?? '?'}:${signatures?.root ?? '?'}`;
      if (
        signatures?.threshold != null &&
        signatures.threshold > 0 &&
        new Set(signatures.signers.map((signer) => addressKey(signer.validator))).size >=
          signatures.threshold
      ) {
        add(
          `quorum:${identity}`,
          'security',
          `Signature threshold reached (${signatures.threshold}/${signatures.threshold})`,
          `The relayer first reported enough matching signatures for ${diagnosticLabel(securityModule.module_type ?? 'this security module')}, checkpoint ${signatures.index}. Other security modules and metadata checks may still be pending.`,
        );
      }
      if (securityModule.metadata_status === 'ready') {
        add(
          `metadata:${identity}`,
          'security',
          securityModule.node_id === state.tree_root
            ? 'All metadata ready'
            : `${diagnosticLabel(securityModule.module_type ?? 'Security module')} metadata ready`,
          'The relayer completed metadata construction for this security module. Transaction simulation and submission follow separately.',
        );
      }
      const before = previousState?.modules.find((item) => item.node_id === securityModule.node_id);
      if (securityModule.verification === 'failed' && before?.verification !== 'failed') {
        add(
          `verification-failed:${identity}:${row.id}`,
          'security',
          'Security verification failed',
          'The relayer reported unsuccessful security-module verification.',
          timestamp,
          'failed',
        );
      }
      if (
        securityModule.offchain_read &&
        securityModule.offchain_read.state !== before?.offchain_read?.state &&
        !['pending', 'pending_retries_exhausted'].includes(securityModule.offchain_read.state)
      ) {
        add(
          `offchain:${identity}:${securityModule.offchain_read.state}`,
          'security',
          `${diagnosticLabel(securityModule.module_type ?? 'Offchain read')}: ${diagnosticLabel(securityModule.offchain_read.state)}`,
          'The relayer reported this offchain response. Receiving metadata does not establish successful verification.',
          timestamp,
          securityModule.offchain_read.state === 'succeeded' ? 'complete' : 'failed',
        );
      }
      if (securityModule.verification === 'succeeded') {
        add(
          `verified:${identity}`,
          'security',
          `${diagnosticLabel(securityModule.module_type ?? 'Security module')} verified`,
          'The relayer reported successful security-module verification.',
        );
      }
    }

    const phase = state.phase;
    const description = describeDiagnosticActivity({
      ...row,
      activity: { ...row.activity, state },
    });
    const phaseTime = validTime(state.phase_started_at_millis);
    if (phase === 'ready_to_submit') {
      add(
        `ready:${phaseTime ?? phase}`,
        'validation',
        'Simulation passed · ready to submit',
        'Metadata preparation and the process transaction simulation completed successfully.',
        phaseTime ?? timestamp,
      );
    } else if (phase === 'submitting' || phase === 'confirming') {
      const submission = state.submission;
      const submissionTime = validTime(submission?.observed_at_millis);
      const stage = submission?.stage ?? phase;
      add(
        `submission:${stage}:${submissionTime ?? phaseTime ?? ''}`,
        'submission',
        diagnosticLabel(stage),
        description.detail,
        submissionTime ?? phaseTime ?? timestamp,
      );
    }
    // Routine polling and cached checkpoint rereads are not milestones. Retain
    // real retry/failure changes; all original observations remain in raw reports.
    if (
      (phase === 'retrying' || phase === 'dropped' || state.failure) &&
      (phase !== previousState?.phase ||
        JSON.stringify(state.retry) !== JSON.stringify(previousState?.retry) ||
        JSON.stringify(state.failure) !== JSON.stringify(previousState?.failure))
    ) {
      add(
        `failure:${row.id}`,
        'activity',
        description.label,
        description.detail,
        timestamp,
        phase === 'dropped' || state.failure ? 'failed' : 'complete',
      );
    }
    previousState = state;
  }

  // The current observation may include unchanged nodes from an anchor outside
  // the loaded pages, even when its update row is present. It proves a signature
  // exists, not when it was first collected. Never fabricate a history row.
  if (observation) {
    entries.push(
      ...moduleSignatureEvents(
        observation.state.modules,
        seenSignatures,
        observation.relayer,
        observation.activityId,
        undefined,
        observation.observedAt,
        [],
      ),
    );
  }

  if (!entries.some((entry) => entry.kind === 'validation')) {
    entries.push({
      ...milestone(
        'validation',
        'Ready to submit',
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
    entry.title =
      entry.timestamp === undefined
        ? 'Signature available · collection time unknown'
        : `Signature collected${entry.signatureThreshold == null ? '' : ` (${count}/${entry.signatureThreshold})`}`;
  }
  markCurrentStep(entries, observation, message.status);
  return entries;
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

function reconstructReports(rows: DiagnosticActivity[]): Report[] {
  let anchor: DiagnosticState | undefined;
  return rows.map((row) => {
    if (!isSupported(row)) return { row, partial: true };
    const state = row.activity.state;
    if (row.activity.type === 'snapshot') {
      anchor = state;
      return { row, state, partial: !state };
    }
    if (row.activity.type !== 'snapshot_update' || !state) return { row, partial: true };
    if (!anchor) {
      return { row, state, partial: true };
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
      title: 'Signature collected',
      detail: `Relayer reported collecting a signature for checkpoint ${observation.index}. This is the relayer’s observation time, not the validator’s signing or upload time.`,
      timestamp,
      timestampRaw: timestamp === undefined ? undefined : row.observed_at,
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
        title: 'Signature collected',
        summary: `${diagnosticLabel(securityModule.module_type ?? 'Security module')}${signatures.index == null ? '' : ` · checkpoint ${signatures.index}`}`,
        detail: `First recorded collection of this signature by this relayer${signatures.index == null ? '' : ` for checkpoint ${signatures.index}`}. ${signatures.signers.length}${signatures.threshold == null ? '' : ` / ${signatures.threshold}`} signatures reported for this security module. This records relayer collection after downloading and checking the signature, not validator signing or upload. If history is incomplete, the collection time is unknown.`,
        timestamp,
        timestampRaw: timestamp === undefined ? undefined : timestampRaw,
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

function addressKey(address: string) {
  return normalizeValidatorAddress(address) ?? address;
}

function compareIds(a: DiagnosticActivity, b: DiagnosticActivity) {
  return BigInt(a.id) < BigInt(b.id) ? -1 : BigInt(a.id) > BigInt(b.id) ? 1 : 0;
}
