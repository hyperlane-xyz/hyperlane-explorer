import { shortenAddress } from '@hyperlane-xyz/utils';
import clsx from 'clsx';
import { useMemo } from 'react';

import { MessageStatus, type Message, type MessageStub } from '../../../types';
import { useMessageDiagnosticsContext } from '../diagnostics/MessageDiagnosticsContext';
import { formatElapsed, formatTimestamp, getMessageTimeline } from '../diagnostics/timeline';
import { diagnosticLabel, isWaitingForCommit } from '../diagnostics/types';
import type { OriginConfirmation } from '../diagnostics/useOriginConfirmation';
import { MessageActivityLog } from './MessageActivityLog';

const workflow = [
  ['Watch origin', 'Find the dispatched message.'],
  ['Build proof', 'Collect the recipient’s verification data.'],
  ['Deliver', 'Submit and check the destination transaction.'],
];
const phaseLabels: Record<string, string> = {
  preparing: 'Building verification proof',
  awaiting_signatures: 'Collecting validator signatures',
  ready_to_submit: 'Proof ready · preparing delivery',
  submitting: 'Submitting delivery transaction',
  confirming: 'Checking delivery transaction',
  delivered: 'Delivery reported · awaiting indexed confirmation',
};

export function MessageRelayActivityPanel({
  message,
  confirmed,
  originConfirmation,
  paused = false,
  waitingForLiquidity = false,
}: {
  message: Message | MessageStub;
  confirmed: boolean;
  originConfirmation?: OriginConfirmation;
  paused?: boolean;
  waitingForLiquidity?: boolean;
}) {
  const {
    history,
    activities,
    observation,
    relayers,
    selectedRelayer,
    setSelectedRelayer,
    connectionState,
  } = useMessageDiagnosticsContext();
  const delivered = message.status === MessageStatus.Delivered;
  const live = connectionState === 'live';
  const confirmationTracked = !message.isPiMsg || confirmed;
  const { stages } = useMemo(
    () =>
      getMessageTimeline(message, observation, activities, {
        confirmed,
        confirmationTracked,
        originConfirmation,
      }),
    [message, observation, activities, confirmed, confirmationTracked, originConfirmation],
  );
  const state = observation?.state;
  const waitingForCommit = isWaitingForCommit(state);
  const currentStatus = delivered
    ? confirmed
      ? 'Delivery confirmed'
      : confirmationTracked
        ? 'Delivered · awaiting destination confirmations'
        : 'Delivered'
    : paused
      ? 'Delivery paused'
      : waitingForLiquidity
        ? 'Waiting for destination liquidity'
        : state?.phase === 'dropped'
          ? 'Relayer stopped processing'
          : !waitingForCommit && (state?.failure || state?.phase === 'retrying')
            ? 'Waiting for next relay attempt'
            : message.status === MessageStatus.Failing
              ? 'Delivery needs attention'
              : message.status === MessageStatus.Unknown
                ? 'Delivery status unavailable'
                : waitingForCommit
                  ? 'Waiting for commit confirmation'
                  : observation
                    ? (phaseLabels[state?.phase ?? ''] ?? diagnosticLabel(state?.phase))
                    : originConfirmation?.tracked && !originConfirmation.confirmed
                      ? 'Waiting for origin confirmations'
                      : 'Awaiting relayer pickup';
  const connectionLabel = live
    ? 'Live connection'
    : connectionState === 'disconnected'
      ? 'Reconnecting'
      : connectionState === 'connecting'
        ? 'Connecting'
        : 'Recorded activity';

  return (
    <MessageActivityLog
      key={message.msgId}
      history={history}
      dispatchedAt={message.origin.timestamp}
      deliveredAt={delivered ? message.destination?.timestamp : undefined}
      controls={
        <div className="space-y-2">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 text-xs">
            <p className="font-medium text-gray-800">{currentStatus}</p>
            <span className="inline-flex items-center gap-1.5 text-gray-500">
              <span
                className={clsx(
                  'h-1.5 w-1.5 rounded-full',
                  live && !delivered
                    ? 'bg-primary-500 motion-safe:animate-pulse'
                    : confirmed
                      ? 'bg-green-600'
                      : 'bg-gray-400',
                )}
              />
              {connectionLabel}
            </span>
          </div>
          <ol
            aria-label="How relaying works"
            className="grid gap-2 rounded-lg bg-gray-50 px-3 py-2.5 text-xs sm:grid-cols-3 sm:gap-4"
          >
            {workflow.map(([label, explanation], index) => (
              <li key={label} className="flex items-start gap-2">
                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-gray-150 text-xxs text-gray-500">
                  {index + 1}
                </span>
                <span className="min-w-0">
                  <span className="font-medium text-gray-700">{label}</span>
                  <span className="mt-0.5 block leading-4 text-gray-500">{explanation}</span>
                </span>
              </li>
            ))}
          </ol>
          <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-gray-500">
            <label htmlFor={`reporter-${message.msgId}`}>Progress source</label>
            <select
              id={`reporter-${message.msgId}`}
              value={selectedRelayer}
              onChange={(event) => setSelectedRelayer(event.target.value)}
              className="max-w-full rounded border border-gray-300 bg-white py-1 pl-2 pr-7 text-xs text-gray-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500"
            >
              <option value="">Automatic · furthest progress</option>
              {selectedRelayer && !observation && (
                <option value={selectedRelayer}>
                  {shortenAddress(selectedRelayer)} · unavailable
                </option>
              )}
              {relayers.map((relay) => (
                <option key={relay.relayer} value={relay.relayer}>
                  {shortenAddress(relay.relayer)} · {diagnosticLabel(relay.state.phase)}
                </option>
              ))}
            </select>
            {observation && (
              <span title={observation.relayer}>{shortenAddress(observation.relayer)}</span>
            )}
          </div>
          <details className="border-t border-gray-200 pt-2">
            <summary className="cursor-pointer text-xs text-gray-600">Stage timings</summary>
            <p className="mt-2 text-xxs text-gray-500">
              Elapsed from dispatch. Proof and pickup times use the selected relayer; chain
              milestones use indexed blocks.
            </p>
            <dl
              aria-label="Stage timings"
              className="mt-2 grid grid-cols-2 gap-x-4 gap-y-3 text-xs sm:grid-cols-3"
            >
              {stages.map((stage) => {
                const notTracked =
                  (stage.id === 'origin_confirmed' &&
                    !originConfirmation?.tracked &&
                    !originConfirmation?.confirmed) ||
                  (stage.id === 'confirmed' && !confirmationTracked);
                return (
                  <div key={stage.id}>
                    <dt className="text-gray-500">{stage.label}</dt>
                    <dd className="mt-0.5 tabular-nums text-gray-800">
                      {stage.timestamp !== undefined ? (
                        <>
                          {stage.sinceDispatch !== undefined && (
                            <span className="mr-1.5 font-medium">
                              +{formatElapsed(stage.sinceDispatch)}
                            </span>
                          )}
                          <time
                            dateTime={new Date(stage.timestamp).toISOString()}
                            title={new Date(stage.timestamp).toISOString()}
                          >
                            {formatTimestamp(stage.timestamp)} local
                          </time>
                          <span className="mt-0.5 block text-xxs text-gray-500">
                            {stage.timeSource === 'chain' ? 'Chain block' : 'Relayer observed'}
                          </span>
                        </>
                      ) : notTracked ? (
                        'Not tracked'
                      ) : stage.status === 'complete' ? (
                        'Time not recorded'
                      ) : (
                        'Pending'
                      )}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </details>
        </div>
      }
    />
  );
}
