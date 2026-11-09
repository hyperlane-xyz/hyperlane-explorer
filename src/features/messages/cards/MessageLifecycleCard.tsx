import { SpinnerIcon } from '@hyperlane-xyz/widgets';
import clsx from 'clsx';
import { useMemo, type ReactNode } from 'react';

import { useChainMetadataResolver } from '../../../metadataStore';
import { MessageStatus, type Message, type MessageStub } from '../../../types';
import {
  estimateConfirmationSeconds,
  estimateDeliverySeconds,
  formatEstimatedTime,
} from '../diagnostics/deliveryEstimate';
import { useMessageDiagnosticsContext } from '../diagnostics/MessageDiagnosticsContext';
import { diagnosticsConnectionLabel, getMessageProgress } from '../diagnostics/progress';
import {
  formatElapsed,
  getMessageTimeline,
  type MessageTimelineStage,
} from '../diagnostics/timeline';
import type { OriginConfirmation } from '../diagnostics/useOriginConfirmation';
import { useExplorerBlockValue } from '../queries/ExplorerEventsProvider';
import { calculateConfirmationCount, getRequiredConfirmations } from '../useConfirmationProgress';

import styles from './MessageLifecycleCard.module.css';

interface Props {
  message: Message | MessageStub;
  confirmed: boolean;
  originConfirmation?: OriginConfirmation;
  messageKind?: string;
  children?: ReactNode | ((active: boolean) => ReactNode);
  notice?: ReactNode;
}

const submissionLabels: Record<string, string> = {
  submitting: 'Submitting transaction',
  submitted: 'Transaction submitted',
  pending_inclusion: 'Awaiting inclusion',
  mempool: 'In mempool',
  included: 'Included · awaiting indexing',
  finalized: 'Included · awaiting indexing',
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
  message,
  confirmed,
  originConfirmation,
  messageKind = 'Interchain message',
  children,
  notice,
}: Props) {
  const { diagnostics, activities, connectionState, observation } = useMessageDiagnosticsContext();
  const metadata = useChainMetadataResolver();
  const destinationHead = useExplorerBlockValue(
    message.status === MessageStatus.Delivered && !confirmed
      ? message.destinationDomainId
      : undefined,
    (head) => (head ? Number(head.headHeight) : undefined),
  );
  const confirmationTracked = !message.isPiMsg || confirmed;
  const timeline = useMemo(
    () =>
      getMessageTimeline(message, observation, activities, {
        confirmed,
        confirmationTracked,
        originConfirmation,
      }),
    [message, observation, activities, confirmed, confirmationTracked, originConfirmation],
  );
  const state = observation?.state;
  const { active, delivered, explanation, originConfirming, status } = getMessageProgress({
    messageStatus: message.status,
    state,
    confirmed,
    confirmationTracked,
    originConfirmation,
  });

  const destinationBlocks = metadata.tryGetChainMetadata(message.destinationDomainId)?.blocks;
  const destinationRequired = confirmationTracked
    ? getRequiredConfirmations(destinationBlocks)
    : undefined;
  const destinationCurrent =
    destinationRequired === undefined
      ? null
      : calculateConfirmationCount(
          message.destination?.blockNumber,
          destinationHead,
          destinationRequired,
        );
  const estimatedSeconds = delivered
    ? !confirmed && confirmationTracked
      ? estimateConfirmationSeconds(
          { confirmed, required: destinationRequired, current: destinationCurrent },
          destinationBlocks?.estimateBlockTime,
        )
      : undefined
    : active
      ? estimateDeliverySeconds(
          metadata.tryGetChainMetadata(message.originDomainId)?.blocks,
          originConfirmation,
          !!observation,
        )
      : undefined;
  const originCurrent = originConfirmation?.current;
  const originRequired = originConfirmation?.required;
  const progressStatus =
    delivered && !confirmed && destinationRequired && destinationCurrent != null
      ? `Destination confirmations · ${destinationCurrent} / ${destinationRequired}`
      : active && state?.phase === 'submitting'
        ? (submissionLabels[state.submission?.stage ?? ''] ?? status)
        : active &&
            !observation &&
            originConfirming &&
            originCurrent != null &&
            originRequired != null
          ? `Origin confirmations · ${originCurrent} / ${originRequired}`
          : status;

  return (
    <section
      aria-label="Message progress"
      className="shadow-card min-w-0 overflow-hidden rounded-xl border border-primary-200/40 bg-white"
    >
      <header
        className={clsx(
          'relative overflow-hidden px-4 py-5 text-white sm:px-5 sm:py-6',
          delivered ? 'bg-green-800' : 'bg-primary-900',
        )}
      >
        {active && <span aria-hidden="true" className={styles.headerSweep} />}
        <div className="relative flex flex-col items-start gap-3 sm:flex-row sm:justify-between sm:gap-4">
          <div className="grid w-full min-w-0 grid-cols-[2.5rem_minmax(0,1fr)] items-center gap-x-3 sm:w-auto sm:flex-1">
            <p className="col-start-2 mb-1 text-xs text-white/70">{messageKind}</p>
            <span
              className={clsx(
                'row-start-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/25 bg-white/10 text-xl',
                active && styles.beacon,
              )}
              aria-hidden="true"
            >
              {delivered ? (
                '✓'
              ) : active ? (
                <SpinnerIcon
                  width={20}
                  height={20}
                  color="currentColor"
                  style={{ color: 'inherit' }}
                  className={styles.spinner}
                />
              ) : (
                '—'
              )}
            </span>
            <h1
              className="col-start-2 row-start-2 min-w-0 text-xl font-medium leading-tight sm:text-2xl"
              aria-live="polite"
            >
              {status}
            </h1>
            <p className="col-start-2 mt-1 max-w-xl text-xs leading-relaxed text-white/80">
              {explanation}
            </p>
          </div>
          <div className="ml-[3.25rem] shrink-0 text-sm sm:ml-0 sm:text-right">
            {!delivered && (
              <span className="inline-flex items-center gap-1.5 text-white/80">
                <span
                  aria-hidden="true"
                  className={clsx(
                    'h-1.5 w-1.5 rounded-full bg-white',
                    connectionState === 'live' && 'motion-safe:animate-pulse',
                  )}
                />
                {connectionState === 'live'
                  ? 'Live updates'
                  : connectionState === 'historical'
                    ? 'Recorded activity'
                    : diagnosticsConnectionLabel(connectionState)}
              </span>
            )}
            {timeline.totalElapsed !== undefined && (
              <p
                className="tabular-nums text-white/80"
                title="Time between recorded origin and destination block timestamps. Whole-second records do not provide fractional timing."
              >
                Delivered in{' '}
                <span className="font-medium text-white">
                  {formatElapsed(timeline.totalElapsed)}
                </span>
              </p>
            )}
          </div>
        </div>
      </header>
      {(children || notice) && (
        <div className="space-y-4 p-4 sm:p-5">
          {typeof children === 'function' ? children(active) : children}
          {notice}
        </div>
      )}
      <div className="border-t border-gray-200 bg-gray-150/60 p-4 sm:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2 text-sm">
          <h2 className="min-w-0 font-medium text-gray-600">
            Progress:{' '}
            <span className="text-primary-800" aria-live="polite" data-testid="progress-status">
              {progressStatus}
            </span>
          </h2>
          {estimatedSeconds !== undefined && estimatedSeconds > 0 && (
            <p
              className="tabular-nums text-gray-500 sm:ml-auto sm:text-right"
              data-testid="delivery-estimate"
            >
              Estimated {delivered ? 'confirmation' : 'delivery'}{' '}
              {formatEstimatedTime(estimatedSeconds)}
            </p>
          )}
        </div>
        <ol
          className="mt-4 grid grid-cols-2 gap-x-3 gap-y-3 sm:grid-cols-3 md:grid-cols-6"
          aria-label="Message lifecycle stages"
        >
          {timeline.stages.map((stage) => (
            <LifecycleStage
              key={stage.id}
              stage={stage}
              originConfirmation={originConfirmation}
              suspended={message.status === MessageStatus.Unknown}
            />
          ))}
        </ol>
        {diagnostics?.partial && (
          <p className="mt-2 text-xs text-gray-500">
            Some observations are missing. Complete relayer reports are retained when available.
          </p>
        )}
      </div>
    </section>
  );
}

function LifecycleStage({
  stage,
  originConfirmation,
  suspended,
}: {
  stage: MessageTimelineStage;
  originConfirmation?: OriginConfirmation;
  suspended: boolean;
}) {
  const complete = stage.status === 'complete';
  const active = stage.status === 'active';
  const running = active && !suspended;
  const isOrigin = stage.id === 'origin_confirmed';
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

  return (
    <li
      aria-label={stage.label}
      aria-current={active ? 'step' : undefined}
      data-status={stage.status}
    >
      <div
        role={running ? 'progressbar' : undefined}
        aria-label={running ? `${stage.label} progress` : undefined}
        aria-valuemin={confirmations !== undefined ? 0 : undefined}
        aria-valuemax={confirmations !== undefined ? required : undefined}
        aria-valuenow={confirmations}
        aria-valuetext={
          running
            ? confirmations !== undefined
              ? `${confirmations} of ${required} confirmations`
              : 'In progress'
            : undefined
        }
        className={clsx(
          'relative h-1 overflow-hidden rounded-full',
          running ? 'bg-primary-200' : 'bg-gray-200',
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
          className={clsx('absolute inset-0 rounded-full', running ? styles.shimmer : 'hidden')}
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
          {running ? (
            <SpinnerIcon
              width={12}
              height={12}
              color="currentColor"
              style={{ color: 'inherit' }}
              className={styles.spinner}
            />
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
            'text-sm font-medium',
            complete || active ? 'text-gray-800' : 'text-gray-500',
          )}
        >
          {active && suspended
            ? stage.id === 'validated'
              ? 'Validation waiting'
              : stage.id === 'delivered'
                ? 'Delivery waiting'
                : (activeLabels[stage.id] ?? stage.label)
            : active || stage.status === 'failed'
              ? (activeLabels[stage.id] ?? stage.label)
              : stage.label}
        </span>
      </div>
    </li>
  );
}
