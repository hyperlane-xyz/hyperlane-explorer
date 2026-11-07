import { shortenAddress } from '@hyperlane-xyz/utils';
import { SpinnerIcon } from '@hyperlane-xyz/widgets';
import clsx from 'clsx';
import { useMemo } from 'react';

import { Card } from '../../../components/layout/Card';
import { MessageStatus, type Message, type MessageStub } from '../../../types';
import { useMessageDiagnosticsContext } from '../diagnostics/MessageDiagnosticsContext';
import {
  formatElapsed,
  formatTimestamp,
  getMessageTimeline,
  type MessageTimelineStage,
} from '../diagnostics/timeline';
import { diagnosticLabel, isWaitingForCommit } from '../diagnostics/types';
import type { OriginConfirmation } from '../diagnostics/useOriginConfirmation';
import { MessageActivityLog } from './MessageActivityLog';

import styles from './MessageLifecycleCard.module.css';

interface Props {
  messageId: string;
  message: Message | MessageStub;
  confirmed: boolean;
  originConfirmation?: OriginConfirmation;
  blur?: boolean;
}

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
const activeLabels: Record<string, string> = {
  dispatched: 'Dispatching',
  origin_confirmed: 'Confirming origin',
  picked_up: 'Awaiting pickup',
  validated: 'Validating',
  delivered: 'Delivering',
  confirmed: 'Confirming',
};

export function MessageLifecycleCard({
  messageId,
  message,
  confirmed,
  originConfirmation,
  blur,
}: Props) {
  const {
    diagnostics,
    history,
    activities,
    connectionState,
    observation,
    relayers,
    selectedRelayer,
    setSelectedRelayer,
  } = useMessageDiagnosticsContext();
  const confirmationTracked = !message.isPiMsg || confirmed;
  const timeline = useMemo(
    () =>
      getMessageTimeline(message, observation, activities, {
        confirmed,
        confirmationTracked,
        originConfirmation,
        historyComplete: !!history.activityPage && !history.activityPage.has_more,
      }),
    [
      message,
      observation,
      activities,
      confirmed,
      confirmationTracked,
      originConfirmation,
      history.activityPage,
    ],
  );
  const delivered = message.status === MessageStatus.Delivered;
  const state = observation?.state;
  const status = confirmed
    ? 'Delivery confirmed'
    : delivered
      ? confirmationTracked
        ? 'Delivered · waiting for destination confirmation'
        : 'Delivered · confirmation not tracked'
      : isWaitingForCommit(state)
        ? 'Waiting for commit confirmation'
        : state?.failure
          ? 'Relayer waiting to retry'
          : state?.phase
            ? (phaseLabels[state.phase] ?? 'Waiting for relay update')
            : originConfirmation?.tracked && !originConfirmation.confirmed
              ? 'Waiting for origin confirmations'
              : 'Waiting for a relayer to pick up this message';
  const live = connectionState === 'live';
  const connectionLabel = live
    ? 'Live activity'
    : connectionState === 'disconnected'
      ? 'Reconnecting'
      : connectionState === 'connecting'
        ? 'Connecting'
        : 'Recorded activity';

  return (
    <Card className={clsx('w-full', blur && 'blur-xs')} padding="p-4 sm:p-5">
      <section aria-label="Message progress">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-xs font-medium uppercase tracking-wider text-gray-500">
              Message progress
            </h3>
            <p className="mt-1.5 text-lg font-medium text-gray-900" aria-live="polite">
              {status}
            </p>
          </div>
          <div className="text-right">
            {timeline.totalElapsed !== undefined && (
              <p className="text-lg font-medium tabular-nums text-green-700">
                {formatElapsed(timeline.totalElapsed)}{' '}
                <span className="text-xs font-normal text-gray-500">block to block</span>
              </p>
            )}
            <span className="mt-1 inline-flex items-center gap-1.5 text-xs text-gray-500">
              <span
                className={clsx(
                  'h-1.5 w-1.5 rounded-full',
                  live
                    ? 'bg-primary-500 motion-safe:animate-pulse'
                    : confirmed
                      ? 'bg-green-600'
                      : 'bg-gray-400',
                )}
              />
              {connectionLabel}
            </span>
          </div>
        </div>

        <ol
          className="mt-6 grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 lg:grid-cols-6"
          aria-label="Message lifecycle stages"
        >
          {timeline.stages.map((stage) => (
            <LifecycleStage
              key={stage.id}
              stage={stage}
              confirmationTracked={confirmationTracked}
              originConfirmation={originConfirmation}
            />
          ))}
        </ol>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-gray-300/60 pt-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-gray-500">
            <label htmlFor={`reporter-${messageId}`}>Following relayer</label>
            <select
              id={`reporter-${messageId}`}
              value={selectedRelayer}
              onChange={(event) => setSelectedRelayer(event.target.value)}
              className="max-w-full rounded border border-gray-300 bg-white py-1.5 pl-2 pr-7 text-xs text-gray-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500"
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
        </div>
        {diagnostics?.partial && (
          <p className="mt-2 text-xs text-gray-500">
            Some observations are missing. Complete relayer reports are retained when available.
          </p>
        )}
        {!timeline.timingComplete && (
          <p className="mt-2 text-xs text-gray-500">
            Unrecorded timings are shown as —. Chain block times and relayer observation times may
            differ.
          </p>
        )}
        <MessageActivityLog
          history={history}
          dispatchedAt={message.origin.timestamp}
          deliveryDuration={timeline.totalElapsed}
          deliveredAt={delivered ? message.destination?.timestamp : undefined}
        />
      </section>
    </Card>
  );
}

function LifecycleStage({
  stage,
  confirmationTracked,
  originConfirmation,
}: {
  stage: MessageTimelineStage;
  confirmationTracked: boolean;
  originConfirmation?: OriginConfirmation;
}) {
  const complete = stage.status === 'complete';
  const active = stage.status === 'active';
  const isOrigin = stage.id === 'origin_confirmed';
  const isConfirmation = stage.id === 'confirmed';
  const required = originConfirmation?.required;
  const current = originConfirmation?.current;
  const confirmations =
    active &&
    isOrigin &&
    required !== undefined &&
    Number.isFinite(required) &&
    required > 0 &&
    current != null &&
    Number.isFinite(current)
      ? Math.min(required, Math.max(0, current))
      : undefined;
  const fraction = confirmations !== undefined ? confirmations / required! : undefined;
  const indeterminate = active && fraction === undefined;
  let timingDetail: string | undefined;
  if (stage.elapsedSincePrevious !== undefined) {
    const elapsed = stage.elapsedSincePrevious;
    const previous =
      stage.id === 'picked_up'
        ? 'origin confirmation'
        : stage.id === 'validated'
          ? 'pickup'
          : stage.id === 'delivered'
            ? 'validation'
            : isConfirmation
              ? 'delivery'
              : 'dispatch';
    timingDetail = `${formatElapsed(Math.abs(elapsed))} ${elapsed < 0 ? 'before' : 'after'} ${previous}`;
  } else if (stage.id === 'dispatched') timingDetail = 'Origin block time';
  else if (isOrigin && originConfirmation?.required !== undefined) {
    timingDetail = complete
      ? `${originConfirmation.required} confirmations`
      : `${originConfirmation.current ?? '—'} / ${originConfirmation.required} confirmations`;
  } else if (isOrigin) timingDetail = 'Confirmation block unavailable';
  else if (isConfirmation && !confirmationTracked) timingDetail = 'Confirmation data unavailable';
  else if (isConfirmation && stage.timestamp === undefined)
    timingDetail = 'Awaiting relayer report';
  else if (stage.status === 'pending' || active) timingDetail = 'Awaiting observation';
  else timingDetail = 'Timing not recorded';

  return (
    <li
      aria-label={stage.label}
      aria-current={active ? 'step' : undefined}
      data-status={stage.status}
    >
      <div
        role={active ? 'progressbar' : undefined}
        aria-label={active ? `${stage.label} progress` : undefined}
        aria-valuemin={confirmations !== undefined ? 0 : undefined}
        aria-valuemax={confirmations !== undefined ? required : undefined}
        aria-valuenow={confirmations}
        aria-valuetext={
          active
            ? confirmations !== undefined
              ? `${confirmations} of ${required} confirmations`
              : 'In progress'
            : undefined
        }
        className={clsx(
          'relative h-1 overflow-hidden rounded-full',
          active ? 'bg-primary-50' : 'bg-gray-200',
        )}
      >
        <span
          aria-hidden="true"
          className={clsx(
            'absolute inset-0 rounded-full',
            styles.fill,
            complete ? 'bg-primary-700' : 'bg-primary-500',
          )}
          style={{ transform: `scaleX(${complete ? 1 : (fraction ?? 0)})` }}
        />
        <span
          aria-hidden="true"
          className={clsx(
            'absolute inset-y-0 left-0 w-2/5 rounded-full bg-primary-500',
            indeterminate ? styles.indeterminate : 'hidden',
          )}
        />
      </div>
      <div className="mt-3 flex min-h-10 items-center gap-1.5">
        <span
          className={clsx(
            'flex h-4 w-4 shrink-0 items-center justify-center text-xs',
            complete || active ? 'text-primary-700' : 'text-gray-400',
          )}
          aria-hidden="true"
        >
          {active ? (
            <SpinnerIcon width={12} height={12} color="currentColor" className={styles.spinner} />
          ) : complete ? (
            '✓'
          ) : stage.status === 'failed' ? (
            '!'
          ) : (
            '·'
          )}
        </span>
        <span
          className={clsx(
            'text-xs font-medium',
            complete || active ? 'text-gray-800' : 'text-gray-500',
          )}
        >
          {active || stage.status === 'failed'
            ? (activeLabels[stage.id] ?? stage.label)
            : stage.label}
        </span>
      </div>
      <div
        className="mt-2 text-sm tabular-nums text-gray-800"
        title={stage.timestamp === undefined ? undefined : new Date(stage.timestamp).toISOString()}
      >
        {stage.timestamp !== undefined
          ? formatTimestamp(stage.timestamp)
          : isConfirmation && !confirmationTracked
            ? 'Not tracked'
            : isConfirmation && complete
              ? 'Confirmed'
              : '—'}
      </div>
      <div className="mt-1 min-h-8 text-xs tabular-nums leading-relaxed text-gray-500">
        {timingDetail}
      </div>
      {isOrigin && originConfirmation?.blockNumber !== undefined && (
        <p className="mt-1 text-xxs leading-relaxed text-gray-500">
          Block {originConfirmation.blockNumber.toLocaleString()}
          {stage.timestamp !== undefined ? ` · ${originConfirmation.required} confirmations` : ''}
        </p>
      )}
      {isConfirmation && stage.timestamp !== undefined && (
        <p
          className="mt-1 text-xxs leading-relaxed text-gray-500"
          title="When this relayer checked successful delivery. This can occur later than the chain confirmation policy was satisfied."
        >
          Relayer observed
        </p>
      )}
    </li>
  );
}
