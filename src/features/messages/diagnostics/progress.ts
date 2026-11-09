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
  confirming: 'Waiting for indexed delivery',
  delivered: 'Relayer observed delivery · waiting for indexer',
  retrying: 'Waiting for the next relay attempt',
  dropped: 'This relayer stopped processing the message',
};

export function getMessageProgress({
  messageStatus,
  state,
  confirmed,
  confirmationTracked,
  originConfirmation,
  paused = false,
  waitingForLiquidity = false,
  selectedRelayer = false,
}: {
  messageStatus: MessageStatus;
  state?: DiagnosticState;
  confirmed: boolean;
  confirmationTracked: boolean;
  originConfirmation?: OriginConfirmation;
  paused?: boolean;
  waitingForLiquidity?: boolean;
  selectedRelayer?: boolean;
}) {
  const delivered = messageStatus === MessageStatus.Delivered;
  const waitingForCommit = isWaitingForCommit(state);
  const waitingForAttestation = isWaitingForOffchainAttestation(state);
  const failed = !!state?.failure && !waitingForCommit;
  const blocked =
    paused ||
    waitingForLiquidity ||
    failed ||
    state?.phase === 'dropped' ||
    (state?.phase === 'retrying' && !waitingForCommit && !waitingForAttestation) ||
    messageStatus === MessageStatus.Failing;
  const active = messageStatus === MessageStatus.Pending && !blocked;
  const originConfirming = !!originConfirmation?.tracked && !originConfirmation.confirmed;

  let status = 'Waiting for relayer pickup';
  if (delivered)
    status = confirmed
      ? 'Delivery confirmed'
      : confirmationTracked
        ? 'Delivered · confirming'
        : 'Delivered · confirmation not tracked';
  else if (paused) status = 'Delivery paused';
  else if (waitingForLiquidity) status = 'Waiting for destination liquidity';
  else if (waitingForCommit) status = 'Waiting for commit confirmation';
  else if (waitingForAttestation) status = 'Waiting for offchain attestation';
  else if (failed) status = 'Relayer waiting to retry';
  else if (messageStatus === MessageStatus.Failing) status = 'Delivery needs attention';
  else if (messageStatus === MessageStatus.Unknown) status = 'Delivery status unavailable';
  else if (state?.phase) status = phaseLabels[state.phase] ?? 'Waiting for relay update';
  else if (originConfirming) status = 'Confirming on origin';

  let activityStatus = 'Awaiting relayer pickup';
  if (
    state?.submission?.stage === 'mempool' &&
    ['submitting', 'confirming'].includes(state.phase ?? '')
  )
    activityStatus = 'In destination mempool';
  else if (waitingForAttestation) activityStatus = 'Waiting for offchain attestation';
  else if (state?.phase) activityStatus = phaseLabels[state.phase] ?? diagnosticLabel(state.phase);
  else if (selectedRelayer) activityStatus = 'Relayer report unavailable';
  else if (originConfirming) activityStatus = 'Waiting for origin confirmations';

  let explanation = 'The message is dispatched. We are watching for the next relay update.';
  if (delivered)
    explanation = confirmed
      ? 'This message has arrived and is confirmed on the destination chain.'
      : confirmationTracked
        ? 'Delivery succeeded. Waiting for confirmations on the destination chain.'
        : 'Delivery succeeded. Additional confirmation data is not available.';
  else if (messageStatus === MessageStatus.Unknown)
    explanation = 'Waiting for enough data to determine the delivery status.';
  else if (blocked)
    explanation = 'Tracking continues. Check the details below for the current delay.';
  else if (waitingForCommit)
    explanation = 'The relayer is waiting for the earlier commitment to become available.';
  else if (waitingForAttestation)
    explanation =
      'The offchain attestation is not ready yet. The relayer is retrying automatically.';
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
    activityStatus: delivered || blocked || waitingForCommit ? status : activityStatus,
    blocked,
    delivered,
    explanation,
    originConfirming,
    relayStopped:
      !delivered && (blocked || waitingForCommit || messageStatus === MessageStatus.Unknown),
    status,
    waitingForCommit,
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
