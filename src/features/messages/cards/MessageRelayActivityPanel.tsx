import { shortenAddress } from '@hyperlane-xyz/utils';
import clsx from 'clsx';
import { useId, useMemo, useState } from 'react';

import { ChainLogo } from '../../../components/icons/ChainLogo';
import { SendIcon } from '../../../components/icons/SendIcon';
import { useChainMetadataResolver } from '../../../metadataStore';
import type { Message, MessageStub } from '../../../types';
import { getChainDisplayName } from '../../chains/utils';
import { useMessageDiagnosticsContext } from '../diagnostics/MessageDiagnosticsContext';
import { diagnosticsConnectionLabel, getMessageProgress } from '../diagnostics/progress';
import {
  formatElapsed,
  formatTimestamp,
  getMessageTimeline,
  type MessageTimelineStage,
} from '../diagnostics/timeline';
import { diagnosticLabel } from '../diagnostics/types';
import type { OriginConfirmation } from '../diagnostics/useOriginConfirmation';
import { MessageActivityLog } from './MessageActivityLog';

const explanations: Record<MessageTimelineStage['id'], string> = {
  dispatched: 'The origin transaction that places this message in the mailbox.',
  origin_confirmed: 'The configured confirmation threshold for the origin block.',
  picked_up: 'Discovery by this relayer. Fast relayers can begin before origin confirmations.',
  validated: 'Preparation of the verification data required by the recipient’s security module.',
  delivered: 'Execution of this message by a destination transaction.',
  confirmed: 'Chain confirmation is tracked separately from the relayer’s delivery recheck.',
};

const timingOrigins: Partial<Record<MessageTimelineStage['id'], string>> = {
  origin_confirmed: 'dispatch',
  picked_up: 'origin confirmation',
  validated: 'pickup',
  delivered: 'validation',
  confirmed: 'delivery',
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
  const progress = getMessageProgress({
    messageStatus: message.status,
    state,
    confirmed,
    confirmationTracked,
    originConfirmation,
    paused,
    waitingForLiquidity,
    selectedRelayer: !!selectedRelayer,
  });
  const connectionLabel = diagnosticsConnectionLabel(connectionState);

  return (
    <MessageActivityLog
      key={message.msgId}
      history={history}
      dispatchedAt={message.origin.timestamp}
      deliveredAt={progress.delivered ? message.destination?.timestamp : undefined}
      header={
        <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2.5">
            <h2 className="text-sm font-medium text-gray-800">Relay activity</h2>
            <span
              className={clsx(
                'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xxs font-medium',
                progress.delivered ? 'bg-green-100/40 text-green-800' : 'bg-gray-150 text-gray-700',
              )}
            >
              {progress.delivered && <span aria-hidden="true">✓</span>}
              {progress.activityStatus}
            </span>
          </div>
          <span
            className="inline-flex items-center gap-1.5 text-xxs text-gray-500"
            title={
              history.fetching ? 'Updating activity' : `${connectionLabel} diagnostics connection`
            }
          >
            <span
              aria-hidden="true"
              className={clsx(
                'h-1.5 w-1.5 rounded-full',
                live ? 'bg-green-600' : 'bg-gray-400',
                live && !progress.delivered && 'motion-safe:animate-pulse',
              )}
            />
            {connectionLabel}
          </span>
        </header>
      }
      controls={
        <>
          <RelayRoute
            key={message.msgId}
            message={message}
            stages={stages}
            originConfirmation={originConfirmation}
            confirmationTracked={confirmationTracked}
            relayStopped={progress.relayStopped}
            relayer={observation?.relayer}
          />
          <div className="mt-3 flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 text-xxs text-gray-500">
            <span>Time since previous step · select a step for details</span>
            <div className="flex min-w-0 items-center gap-2">
              <label htmlFor={`reporter-${message.msgId}`}>Relayer</label>
              <select
                id={`reporter-${message.msgId}`}
                value={selectedRelayer}
                onChange={(event) => setSelectedRelayer(event.target.value)}
                className="min-w-0 max-w-full rounded border border-gray-200 bg-white py-1 pl-2 pr-7 text-xxs text-gray-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500"
              >
                <option value="">Auto · furthest progress</option>
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
            </div>
          </div>
        </>
      }
    />
  );
}

function RelayRoute({
  message,
  stages,
  originConfirmation,
  confirmationTracked,
  relayStopped,
  relayer,
}: {
  message: Message | MessageStub;
  stages: MessageTimelineStage[];
  originConfirmation?: OriginConfirmation;
  confirmationTracked: boolean;
  relayStopped: boolean;
  relayer?: string;
}) {
  const resolver = useChainMetadataResolver();
  const [selectedId, setSelectedId] = useState<MessageTimelineStage['id']>();
  const detailsId = useId();
  const selected = stages.find((stage) => stage.id === selectedId);
  const groups = [
    { label: 'Origin', domain: message.originDomainId, stages: stages.slice(0, 2) },
    { label: 'Relayer', domain: undefined, stages: stages.slice(2, 4) },
    { label: 'Destination', domain: message.destinationDomainId, stages: stages.slice(4, 6) },
  ];

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50/70 p-3 sm:p-4">
      <ol aria-label="Message relay route" className="grid gap-5 sm:grid-cols-3 sm:gap-8">
        {groups.map((group, groupIndex) => {
          const chainName =
            group.domain === undefined
              ? undefined
              : (resolver.tryGetChainName(group.domain) ?? undefined);
          const name =
            group.domain === undefined
              ? relayer
                ? shortenAddress(relayer)
                : 'Not reported'
              : chainName
                ? getChainDisplayName(resolver, chainName)
                : `Domain ${group.domain}`;
          const sending =
            groupIndex === 1 &&
            stages.find((stage) => stage.id === 'delivered')?.status === 'active' &&
            !relayStopped;
          return (
            <li key={group.label} className="relative min-w-0">
              {groupIndex < 2 && (
                <span
                  aria-hidden="true"
                  className={clsx(
                    'absolute -right-6 top-3 hidden sm:block',
                    sending ? 'text-primary-600 motion-safe:animate-pulse' : 'text-gray-400',
                  )}
                >
                  →
                </span>
              )}
              <div className="mb-2 flex min-w-0 items-center gap-2.5">
                <span
                  className={clsx(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-full border bg-white',
                    groupIndex === 1 ? 'border-primary-200 text-primary-700' : 'border-gray-200',
                  )}
                >
                  {groupIndex === 1 ? (
                    <SendIcon size={15} active={sending} />
                  ) : (
                    <ChainLogo chainName={chainName} size={23} />
                  )}
                </span>
                <div className="min-w-0">
                  <h3 className="text-xxs text-gray-500">{group.label}</h3>
                  <p
                    className="mt-0.5 truncate text-xs font-medium text-gray-800"
                    title={relayer && groupIndex === 1 ? relayer : name}
                  >
                    {name}
                  </p>
                </div>
              </div>
              <ul className="space-y-0.5">
                {group.stages.map((stage) => {
                  const complete = stage.status === 'complete';
                  const active = stage.status === 'active';
                  const origin = stage.id === 'origin_confirmed';
                  const notTracked = origin
                    ? !originConfirmation?.tracked && !originConfirmation?.confirmed
                    : stage.id === 'confirmed' && !confirmationTracked;
                  const running = active && (origin || !relayStopped);
                  const label =
                    stage.id === 'picked_up'
                      ? 'Picked up'
                      : stage.id === 'confirmed'
                        ? 'Confirmation'
                        : stage.label;
                  const interval = stage.elapsedSincePrevious;
                  const timingValue =
                    stage.id === 'dispatched' && stage.timestamp !== undefined
                      ? '0s'
                      : interval !== undefined
                        ? `${interval < 0 ? '−' : '+'}${formatElapsed(Math.abs(interval))}`
                        : undefined;
                  const value = notTracked
                    ? 'Not tracked'
                    : stage.id === 'confirmed'
                      ? complete
                        ? 'Confirmed'
                        : active
                          ? 'Confirming'
                          : '—'
                      : origin && active && originConfirmation?.required !== undefined
                        ? `${originConfirmation.current ?? '—'}/${originConfirmation.required}`
                        : timingValue !== undefined
                          ? timingValue
                          : complete
                            ? '—'
                            : active || stage.status === 'failed'
                              ? relayStopped && !origin
                                ? 'Waiting'
                                : 'In progress'
                              : '—';
                  return (
                    <li key={stage.id}>
                      <button
                        type="button"
                        aria-label={`${label} timing details`}
                        aria-expanded={selectedId === stage.id}
                        aria-controls={detailsId}
                        data-status={stage.status}
                        onClick={() =>
                          setSelectedId(selectedId === stage.id ? undefined : stage.id)
                        }
                        className={clsx(
                          'flex w-full min-w-0 items-center gap-1.5 rounded px-1.5 py-1.5 text-left text-xxs transition-colors hover:bg-gray-200/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500',
                          selectedId === stage.id && 'bg-white shadow-sm',
                        )}
                      >
                        <span
                          aria-hidden="true"
                          className={clsx(
                            'flex h-3.5 w-3.5 shrink-0 items-center justify-center',
                            complete && groupIndex === 2
                              ? 'text-green-700'
                              : complete || running
                                ? 'text-primary-700'
                                : 'text-gray-400',
                          )}
                        >
                          {complete ? (
                            '✓'
                          ) : running ? (
                            <span className="h-2.5 w-2.5 rounded-full border border-current border-t-transparent motion-safe:animate-spin" />
                          ) : (
                            '·'
                          )}
                        </span>
                        <span
                          className={clsx(
                            'min-w-0 flex-1',
                            complete || active ? 'text-gray-700' : 'text-gray-500',
                          )}
                        >
                          {label}
                        </span>
                        <span
                          className="shrink-0 tabular-nums text-gray-500 underline decoration-gray-300 decoration-dotted underline-offset-4"
                          title={
                            stage.id !== 'confirmed' &&
                            interval !== undefined &&
                            timingOrigins[stage.id]
                              ? `${formatElapsed(Math.abs(interval))} ${interval < 0 ? 'before' : 'after'} ${timingOrigins[stage.id]}`
                              : undefined
                          }
                        >
                          {value}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </li>
          );
        })}
      </ol>
      {selected && (
        <section
          id={detailsId}
          aria-label={`${selected.label} timing details`}
          className="mt-3 border-t border-gray-200 pt-3 text-xs"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h4 className="font-medium text-gray-700">
              {selected.id === 'confirmed' ? 'Relayer checked delivery' : selected.label}
              {selected.elapsedSincePrevious !== undefined && timingOrigins[selected.id] && (
                <span className="ml-2 text-xxs font-normal text-gray-500">
                  {formatElapsed(Math.abs(selected.elapsedSincePrevious))}{' '}
                  {selected.elapsedSincePrevious < 0 ? 'before' : 'after'}{' '}
                  {timingOrigins[selected.id]}
                </span>
              )}
            </h4>
            {selected.timestamp !== undefined ? (
              <span className="text-xxs text-gray-500">
                <time
                  className="tabular-nums"
                  dateTime={new Date(selected.timestamp).toISOString()}
                  title={new Date(selected.timestamp).toISOString()}
                >
                  {formatTimestamp(selected.timestamp)} local
                </time>
                {' · '}
                {selected.timeSource === 'chain' ? 'Chain timestamp' : 'Relayer observed'}
                {selected.sinceDispatch !== undefined &&
                  ` · +${formatElapsed(selected.sinceDispatch)} from dispatch`}
              </span>
            ) : (
              <span className="text-xxs text-gray-500">Time not reported</span>
            )}
          </div>
          <p className="mt-1 text-xxs leading-relaxed text-gray-500">{explanations[selected.id]}</p>
        </section>
      )}
    </div>
  );
}
