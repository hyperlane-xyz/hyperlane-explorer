import { MessageStatus, type MessageStub } from '../../../types';
import {
  elapsed,
  getMessageTimeline,
  hasPassedValidation,
  parseObservationTime,
  validTime,
} from './timeline';
import {
  describeDiagnosticActivity,
  diagnosticLabel,
  mergeDiagnosticState,
  offchainReadLabel,
  offchainReadStatus,
  type DiagnosticActivity,
  type DiagnosticModule,
  type DiagnosticState,
  type LifecycleStepStatus,
  type RelayerDiagnosticState,
} from './types';
import type { OriginConfirmation } from './useOriginConfirmation';
import { normalizeValidatorAddress } from './validatorSignatures';

export interface TimelineEntry {
  id: string;
  kind:
    | 'dispatch'
    | 'origin_confirmed'
    | 'pickup'
    | 'signature'
    | 'offchain_read'
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
  offchainRead?: NonNullable<DiagnosticModule['offchain_read']>;
  reorgResults?: { validator: string; result: string }[];
  ism?: string;
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
  originConfirmation?: OriginConfirmation;
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
  originConfirmation,
}: TimelineOptions) {
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
  const { stages, totalElapsed, pickupToSubmission } = getMessageTimeline(
    message,
    observation,
    supportedRows,
    {
      historyComplete,
    },
  );
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

  if (originConfirmation) {
    const { blockNumber, required, confirmed, tracked } = originConfirmation;
    const timestamp = confirmed ? validTime(originConfirmation.timestamp) : undefined;
    entries.push({
      ...milestone(
        'origin_confirmed',
        'Origin confirmed',
        blockNumber !== undefined && required !== undefined
          ? `Origin confirmation block ${blockNumber.toLocaleString('en-US')} is dispatch block ${message.origin.blockNumber?.toLocaleString('en-US')} plus ${required} confirmation blocks. This uses the configured reorg period, with confirmations as the fallback. The time is this block’s timestamp, not when a relayer observed it.`
          : 'The origin confirmation block cannot be derived from the configured finality policy. Its block time is unavailable.',
        confirmed ? 'complete' : tracked ? 'active' : 'pending',
        timestamp,
      ),
      summary:
        blockNumber !== undefined
          ? `Block ${blockNumber.toLocaleString('en-US')} · ${required} blocks after dispatch`
          : 'Origin confirmation block unavailable',
      blockTimestamp: timestamp,
    });
  }

  const seenSignatures = new Set<string>();
  const milestones = new Map<string, TimelineEntry>();
  const validatorSets = new Map<
    string,
    {
      identity?: string;
      resolvedAttempt?: string;
      inheritedReorgOutcomes?: Map<string, string>;
      reorgOutcomes: Map<string, TimelineEntry>;
    }
  >();
  const groupedChecks = new Set<TimelineEntry>();
  let prepareStartedAt: number | undefined;
  let previousReport: Report | undefined;
  for (const report of reports) {
    const { row, state } = report;
    const observedAt = parseObservationTime(row.observed_at);
    // Snapshot membership proves existence, not first collection. Until history is
    // complete, never assign an arbitrary later snapshot's time to a signature.
    const timestamp = historyComplete ? observedAt : undefined;
    entries.push(...signatureEvents(report, seenSignatures, timestamp));
    if (!isSupported(row)) continue;
    if (!state) continue;
    const previousState = previousReport?.state;

    const add = (
      key: string,
      kind: TimelineEntry['kind'],
      title: string,
      detail: string,
      time: number | undefined,
      status: LifecycleStepStatus = 'complete',
      context?: Pick<TimelineEntry, 'summary' | 'validator' | 'ism' | 'offchainRead'>,
    ) => {
      const existing = milestones.get(key);
      if (existing) return existing;
      const entry: TimelineEntry = {
        id: `${key}:${row.id}`,
        kind,
        title,
        detail,
        ...context,
        timestamp: time,
        timestampRaw: time === undefined ? undefined : new Date(time).toISOString(),
        timeSource: 'relayer',
        status,
        relayer: row.relayer,
        rows: [row],
        repeatCount: 1,
        phase: state.phase,
        submissionStage: state.submission?.stage,
      };
      milestones.set(key, entry);
      entries.push(entry);
      return entry;
    };

    const phase = state.phase;
    const phaseTime = validTime(state.phase_started_at_millis);
    const priorPrepareStartedAt = prepareStartedAt;
    if (phase === 'preparing' && state.checks?.prepare === 'started' && phaseTime !== undefined) {
      prepareStartedAt = phaseTime;
      add(
        `prepare:${phaseTime}`,
        'activity',
        'Prepare started',
        'The relayer started preparing this delivery attempt.',
        historyComplete ? phaseTime : undefined,
      );
    }
    const startsNewAttempt = prepareStartedAt !== priorPrepareStartedAt;
    if (startsNewAttempt) validatorSets.clear();
    // A retained cumulative report can show a completed check on the first
    // visible start row. Only a later report can establish its observation time.
    const checkTime =
      priorPrepareStartedAt !== undefined &&
      priorPrepareStartedAt === prepareStartedAt &&
      !report.partial
        ? timestamp
        : undefined;
    const attempt = String(prepareStartedAt ?? 'unknown');
    if (state.checks?.gas_preflight === 'succeeded') {
      add(
        `gas-preflight:${attempt}`,
        'activity',
        'Gas preflight passed',
        'The relayer’s initial gas payment requirement check passed.',
        checkTime,
      );
    }

    for (const securityModule of state.modules) {
      const nodeId = securityModule.node_id;
      const before = previousState?.modules.find((item) => item.node_id === nodeId);
      const moduleLabel = diagnosticLabel(securityModule.module_type ?? 'Security module');
      const validators = securityModule.validators
        ? [...new Set(securityModule.validators.map(addressKey))]
        : undefined;
      const setIdentity = validators
        ? JSON.stringify([validators, securityModule.threshold])
        : undefined;
      let nodeChecks = validatorSets.get(nodeId);
      // Missing node data may be a partial report. An observed set change
      // invalidates its resolution and prior reorg results.
      if (!nodeChecks || (setIdentity !== undefined && nodeChecks.identity !== setIdentity)) {
        nodeChecks = {
          identity: setIdentity,
          inheritedReorgOutcomes: nodeChecks?.inheritedReorgOutcomes,
          reorgOutcomes: new Map(),
        };
        validatorSets.set(nodeId, nodeChecks);
      }
      if (
        securityModule.checks?.validator_set === 'succeeded' &&
        nodeChecks.resolvedAttempt !== attempt
      ) {
        nodeChecks.resolvedAttempt = attempt;
        add(
          `validator-set:${nodeId}:${row.id}`,
          'security',
          'Validator set resolved',
          'The relayer obtained the validator set and verified that its signature threshold is within bounds.',
          checkTime,
          'complete',
          {
            ism: securityModule.ism,
            summary:
              securityModule.threshold != null && securityModule.validators
                ? `${moduleLabel} · ${securityModule.threshold} of ${securityModule.validators.length} signatures required`
                : moduleLabel,
          },
        );
      }
      const clearChecks = new Map<string, TimelineEntry>();
      const checks = securityModule.reorg_checks ?? [];
      // Cumulative reports can retain checks when the relayer starts a new attempt.
      // Keep those outcomes out of the new attempt until the report changes or clears them.
      const hasPriorBaseline = !!before || previousReport?.partial === false;
      const mayContainRetainedChecks =
        !historyComplete || report.partial || observedAt === phaseTime;
      const baselineChecks = hasPriorBaseline
        ? before?.reorg_checks
        : mayContainRetainedChecks
          ? checks
          : undefined;
      const inherited = startsNewAttempt
        ? new Map(
            baselineChecks?.map(({ validator, states }) => [
              addressKey(validator),
              describeReorgCheck(states)?.title,
            ]),
          )
        : nodeChecks.inheritedReorgOutcomes;
      const stillInherited = inherited?.size ? new Map<string, string>() : undefined;
      for (const { validator, states } of checks) {
        const outcome = describeReorgCheck(states);
        if (!outcome) continue;
        const key = addressKey(validator);
        if (inherited?.get(key) === outcome.title) {
          stillInherited?.set(key, outcome.title);
          continue;
        }
        let entry = nodeChecks.reorgOutcomes.get(key);
        if (entry?.title !== outcome.title) {
          entry = add(
            `reorg:${nodeId}:${key}:${outcome.title}:${row.id}`,
            'security',
            outcome.title,
            outcome.detail,
            report.partial ? undefined : timestamp,
            outcome.status,
            { summary: moduleLabel, validator, ism: securityModule.ism },
          );
          nodeChecks.reorgOutcomes.set(key, entry);
        }
        if (outcome.title === clearReorgTitle) clearChecks.set(key, entry);
      }
      nodeChecks.inheritedReorgOutcomes = stillInherited?.size ? stillInherited : undefined;
      // Only the current report can confirm the entire set is clear.
      if (
        validators?.length &&
        clearChecks.size === checks.length &&
        validators.length === clearChecks.size &&
        validators.every((validator) => clearChecks.has(validator)) &&
        [...clearChecks.values()].some((entry) => !groupedChecks.has(entry))
      ) {
        const group = add(
          `reorg-passed:${nodeId}:${row.id}`,
          'security',
          'Reorg checks passed',
          'The relayer found no reorg flag for any validator in this set.',
          report.partial ? undefined : timestamp,
          'complete',
          {
            summary: `${validators.length} ${validators.length === 1 ? 'validator' : 'validators'} checked · ${moduleLabel}`,
            ism: securityModule.ism,
          },
        );
        group.reorgResults = validators.map((validator) => ({
          validator,
          result: clearReorgTitle,
        }));
        const sources = new Map([[row.id, row]]);
        for (const entry of clearChecks.values()) {
          groupedChecks.add(entry);
          for (const source of entry.rows) sources.set(source.id, source);
        }
        group.rows = [...sources.values()].sort(compareIds);
      }
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
          timestamp,
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
          timestamp,
        );
      }
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
      const read = securityModule.offchain_read;
      const prior = before?.offchain_read;
      if (
        read &&
        (prior?.state !== read.state ||
          prior.observed_at_millis !== read.observed_at_millis ||
          prior.endpoint !== read.endpoint ||
          prior.hostname !== read.hostname ||
          prior.url_template !== read.url_template ||
          prior.attempt !== read.attempt ||
          prior.http_status !== read.http_status ||
          prior.result?.keccak256 !== read.result?.keccak256)
      ) {
        const context = [
          read.hostname ?? (read.endpoint != null && `Endpoint ${read.endpoint + 1}`),
          read.attempt != null && read.attempt > 0 && `Attempt ${read.attempt}`,
          read.http_status != null && `HTTP ${read.http_status}`,
          read.result && `${read.result.bytes} ${read.result.bytes === 1 ? 'byte' : 'bytes'}`,
        ]
          .filter(Boolean)
          .join(' · ');
        const label = offchainReadLabel(read.state);
        add(
          `offchain:${nodeId}:${read.endpoint ?? 'lookup'}:${row.id}`,
          'offchain_read',
          label,
          label,
          validTime(read.observed_at_millis) ?? (report.partial ? undefined : timestamp),
          offchainReadStatus(read.state),
          { summary: context || moduleLabel, ism: securityModule.ism, offchainRead: read },
        );
      }
      if (securityModule.verification === 'succeeded') {
        add(
          `verified:${identity}`,
          'security',
          `${diagnosticLabel(securityModule.module_type ?? 'Security module')} verified`,
          'The relayer reported successful security-module verification.',
          timestamp,
        );
      }
    }

    const description = describeDiagnosticActivity({
      ...row,
      activity: { ...row.activity, state },
    });
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
    previousReport = report;
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
  const visibleEntries = entries
    .filter((entry) => !groupedChecks.has(entry))
    .sort((a, b) => {
      const aTime = a.orderTimestamp ?? a.timestamp;
      const bTime = b.orderTimestamp ?? b.timestamp;
      if (aTime === undefined) return bTime === undefined ? 0 : 1;
      if (bTime === undefined) return -1;
      return aTime - bTime || timelineRank(a.kind) - timelineRank(b.kind);
    });
  // Number individual signatures in displayed order, including batches first seen together.
  const signatureCounts = new Map<string, number>();
  for (const entry of visibleEntries) {
    if (!entry.signatureGroup) continue;
    const count = (signatureCounts.get(entry.signatureGroup) ?? 0) + 1;
    signatureCounts.set(entry.signatureGroup, count);
    entry.title =
      entry.timestamp === undefined
        ? 'Signature available · collection time unknown'
        : `Signature collected${entry.signatureThreshold == null ? '' : ` (${count}/${entry.signatureThreshold})`}`;
  }
  markCurrentStep(visibleEntries, observation, message.status);
  return {
    entries: visibleEntries,
    totalElapsed,
    pickupToSubmission,
    ismValidationTime: historyComplete ? getIsmValidationTime(reports) : undefined,
  };
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
      entry.id.startsWith('failure:') || entry.kind === 'submission'
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

const clearReorgTitle = 'No reorg reported';

function describeReorgCheck(
  states: string[],
): Pick<TimelineEntry, 'title' | 'detail' | 'status'> | undefined {
  if (states.includes('reorg_reported')) {
    return states.includes('reorg_ignored')
      ? {
          title: 'Reorg reported · ignored',
          detail:
            'The validator published a reorg flag. The relayer continued the metadata attempt with that validator excluded.',
          status: 'complete',
        }
      : {
          title: 'Reorg reported',
          detail: 'The validator published a reorg flag. The relayer vetoed this metadata attempt.',
          status: 'failed',
        };
  }
  if (states.includes('reorg_check_failed')) {
    return {
      title: 'Reorg check failed',
      detail:
        'The relayer could not read the validator’s reorg flag. The validator remained eligible for this metadata attempt.',
      status: 'failed',
    };
  }
  if (states.includes('reorg_not_found')) {
    return {
      title: clearReorgTitle,
      detail: 'The relayer checked the validator’s checkpoint storage and found no reorg flag.',
      status: 'complete',
    };
  }
  return undefined;
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
    'origin_confirmed',
    'pickup',
    'signature',
    'security',
    'activity',
    'validation',
    'submission',
    'delivery',
  ].indexOf(kind === 'offchain_read' ? 'security' : kind);
}

function getIsmValidationTime(reports: Report[]) {
  let resolution: { nodeId: string; moduleType: string; observedAt?: number } | undefined;
  for (const { state, row, partial } of reports) {
    if (!state || partial) continue;
    const root = state.modules.find((module) => module.node_id === state.tree_root);
    const sameIsm =
      resolution?.nodeId === root?.node_id && resolution?.moduleType === root?.module_type;
    if (root?.metadata_status === 'ready') {
      // A snapshot that first reports both milestones cannot establish the interval.
      return sameIsm
        ? elapsed(resolution?.observedAt, parseObservationTime(row.observed_at))
        : undefined;
    }
    if (!root?.module_type || root.discovered === false) {
      resolution = undefined;
    } else if (!sameIsm) {
      resolution = {
        nodeId: root.node_id,
        moduleType: root.module_type,
        observedAt: parseObservationTime(row.observed_at),
      };
    }
  }
  return undefined;
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
        ism: securityModule.ism,
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
