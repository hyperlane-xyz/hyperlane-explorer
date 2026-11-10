import { MessageStatus } from '../../../types';
import type { DiagnosticState } from './types';
import { diagnosticLabel, isWaitingForCommit, isWaitingForOffchainAttestation } from './types';
import type { DiagnosticsConnectionState } from './useMessageDiagnostics';
import type { OriginConfirmation } from './useOriginConfirmation';

const phaseLabels: Record<string, string> = {
  preparing: 'Validating message',
  awaiting_signatures: 'Collecting validator signatures',
  ready_to_submit: 'Validated · preparing delivery',
  submitting: 'Delivering message',
  confirming: 'Confirming delivery',
  delivered: 'Delivery observed · indexing',
  retrying: 'Retrying delivery',
  dropped: 'Relayer stopped this attempt',
};

export function getMessageProgress({
  messageStatus,
  state,
  confirmed,
  confirmationTracked,
  originConfirmation,
  selectedRelayer = false,
}: {
  messageStatus: MessageStatus;
  state?: DiagnosticState;
  confirmed: boolean;
  confirmationTracked: boolean;
  originConfirmation?: OriginConfirmation;
  selectedRelayer?: boolean;
}) {
  const delivered = messageStatus === MessageStatus.Delivered;
  const waitingForCommit = isWaitingForCommit(state);
  const waitingForAttestation = isWaitingForOffchainAttestation(state);
  const hasRelayIssue = !!state?.failure || ['retrying', 'dropped'].includes(state?.phase ?? '');
  const active = [MessageStatus.Pending, MessageStatus.Failing].includes(messageStatus);
  const originConfirming = !!originConfirmation?.tracked && !originConfirmation.confirmed;

  let status = 'Pending relayer pickup';
  if (delivered)
    status = confirmed
      ? 'Delivery confirmed'
      : confirmationTracked
        ? 'Delivered · confirming'
        : 'Delivered · confirmation not tracked';
  else if (messageStatus === MessageStatus.Unknown) status = 'Delivery status unavailable';
  else if (waitingForCommit || waitingForAttestation || hasRelayIssue) status = 'Delivery pending';
  else if (state?.phase) status = phaseLabels[state.phase] ?? 'Delivery pending';
  else if (originConfirming) status = 'Confirming on origin';

  let activityStatus = 'Relayer pickup pending';
  if (
    state?.submission?.stage === 'mempool' &&
    ['submitting', 'confirming'].includes(state.phase ?? '')
  )
    activityStatus = 'In destination mempool';
  else if (waitingForCommit) activityStatus = 'Commit confirmation pending';
  else if (waitingForAttestation) activityStatus = 'Offchain attestation pending';
  else if (state?.phase) activityStatus = phaseLabels[state.phase] ?? diagnosticLabel(state.phase);
  else if (selectedRelayer) activityStatus = 'Relayer report unavailable';
  else if (originConfirming) activityStatus = 'Origin confirmations pending';

  let explanation = 'The message is dispatched. We are watching for the next relay update.';
  if (delivered)
    explanation = confirmed
      ? 'This message has arrived and is confirmed on the destination chain.'
      : confirmationTracked
        ? 'Delivery succeeded. Waiting for confirmations on the destination chain.'
        : 'Delivery succeeded. Additional confirmation data is not available.';
  else if (messageStatus === MessageStatus.Unknown)
    explanation = 'Waiting for enough data to determine the delivery status.';
  else if (waitingForCommit)
    explanation = 'The earlier commitment is still pending. Relayers will continue automatically.';
  else if (waitingForAttestation)
    explanation = 'The offchain attestation is pending. Relayers will continue automatically.';
  else if (hasRelayIssue)
    explanation = 'The message remains pending while relayers retry automatically.';
  else if (originConfirming)
    explanation = `${originConfirmation.current ?? '—'} / ${originConfirmation.required ?? '—'} origin confirmations${state ? ' · the relayer is also processing this message.' : ' · waiting for the source chain to confirm.'}`;
  else if (state?.phase === 'submitting')
    explanation = 'The relayer is sending the delivery transaction to the destination chain.';
  else if (['confirming', 'delivered'].includes(state?.phase ?? ''))
    explanation = 'Waiting for on-chain delivery to appear in the explorer.';
  else if (['preparing', 'awaiting_signatures', 'ready_to_submit'].includes(state?.phase ?? ''))
    explanation = 'The relayer has picked up the message and is preparing it for delivery.';

  return {
    active,
    activityStatus: delivered ? status : activityStatus,
    delivered,
    explanation,
    originConfirming,
    relayStopped:
      !delivered && (state?.phase === 'dropped' || messageStatus === MessageStatus.Unknown),
    status,
    waitingForCommit,
  };
}

/** The persisted retry counter includes metadata and attestation delays. */
export function getDeliveryRetryStatus(state?: DiagnosticState) {
  const count = Number(state?.retry?.count);
  const retryCount = Number.isSafeInteger(count) && count >= 0 ? count : 0;
  return {
    retryCount,
    showWarning:
      retryCount >= 5 &&
      ['retrying', 'awaiting_signatures', 'dropped'].includes(state?.phase ?? ''),
  };
}

export function diagnosticsConnectionLabel(state: DiagnosticsConnectionState) {
  return state === 'live'
    ? 'Live'
    : state === 'disconnected'
      ? 'Reconnecting'
      : state === 'connecting'
        ? 'Connecting'
        : 'Recorded';
}
