import { shortenAddress } from '@hyperlane-xyz/utils';
import clsx from 'clsx';
import { useState, type ReactNode } from 'react';

import { getRelayerLabel } from '../../../consts/relayers';
import type { TimelineEntry } from '../diagnostics/activityTimeline';
import { formatPreciseElapsed } from '../diagnostics/timeline';
import {
  describeDiagnosticActivity,
  diagnosticLabel,
  type DiagnosticActivity,
} from '../diagnostics/types';
import { normalizeValidatorAddress } from '../diagnostics/validatorSignatures';
import { MessageTimelineIcon } from './MessageTimelineIcon';

import styles from './MessageActivityTimeline.module.css';

export function MessageActivityTimeline({
  entries,
  dispatchedAt,
  header,
}: {
  entries: TimelineEntry[];
  dispatchedAt: number;
  header?: ReactNode;
}) {
  const recorded = entries.filter(
    (entry) => entry.timestamp !== undefined || entry.orderTimestamp !== undefined,
  );
  const untimed = entries.filter(
    (entry) => entry.timestamp === undefined && entry.orderTimestamp === undefined,
  );
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 pb-3 text-xxs">
        {header}
        <div className="ml-auto text-right leading-relaxed">
          <div className="text-primary-600">Since dispatch</div>
          <div className="text-gray-500">Since previous activity</div>
        </div>
      </div>
      <ol className={styles.timeline} aria-label="Recorded message events">
        {recorded.map((entry, index) => {
          const previous = recorded[index - 1];
          return (
            <TimelineRow
              key={entry.id}
              entry={entry}
              dispatchedAt={dispatchedAt}
              previousAt={previous?.endTimestamp ?? previous?.timestamp}
            />
          );
        })}
      </ol>
      {!!untimed.length && (
        <div className="mt-3 border-t border-dashed border-gray-200 pt-4">
          <p className="mb-3 text-xxs text-gray-500">
            Milestones without a recorded observation time
          </p>
          <ol className={styles.timeline} aria-label="Milestones without recorded timestamps">
            {untimed.map((entry) => (
              <TimelineRow key={entry.id} entry={entry} dispatchedAt={dispatchedAt} />
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

function TimelineRow({
  entry,
  dispatchedAt,
  previousAt,
}: {
  entry: TimelineEntry;
  dispatchedAt: number;
  previousAt?: number;
}) {
  const [open, setOpen] = useState(false);
  const success =
    entry.status === 'complete' &&
    (entry.kind === 'delivery' || entry.kind === 'signature' || entry.kind === 'offchain_read');
  const active = entry.status === 'active';
  // A collapsed run ends at its last report. Its elapsed time must include the
  // waiting hidden inside the group, not make that time disappear on expansion.
  const eventTime = entry.endTimestamp ?? entry.timestamp;
  const sinceDispatch = elapsed(dispatchedAt, eventTime);
  const sincePrevious = elapsed(previousAt, eventTime);
  const repeated = entry.repeatCount > 1;
  const clock =
    entry.kind === 'dispatch' || entry.kind === 'origin_confirmed'
      ? (entry.blockTimestamp ?? entry.timestamp)
      : entry.kind === 'delivery'
        ? (entry.blockTimestamp ?? (entry.timeSource === 'chain' ? entry.timestamp : undefined))
        : undefined;
  return (
    <li className={styles.row} aria-current={active ? 'step' : undefined} aria-busy={active}>
      <div className={styles.event}>
        <span
          aria-hidden="true"
          className={clsx(
            styles.node,
            success
              ? styles.success
              : entry.status === 'failed'
                ? styles.failed
                : entry.status === 'pending'
                  ? styles.pending
                  : styles.observed,
            active && styles.active,
          )}
        >
          <MessageTimelineIcon entry={entry} />
        </span>
        <details className={styles.details} onToggle={(event) => setOpen(event.currentTarget.open)}>
          <summary className={styles.summary}>
            <div className={styles.description}>
              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                <span
                  className={clsx(
                    'text-xs font-medium',
                    success
                      ? 'text-green-800'
                      : entry.status === 'pending'
                        ? 'text-gray-500'
                        : 'text-gray-900',
                  )}
                >
                  {entry.title}
                </span>
                {repeated && (
                  <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-xxs text-gray-600">
                    {entry.repeatCount} reports
                  </span>
                )}
                {active && <span className="text-xxs text-primary-700">In progress</span>}
                {entry.status === 'pending' && (
                  <span className="text-xxs text-gray-500">Pending</span>
                )}
                <span className={styles.chevron} aria-hidden="true">
                  ›
                </span>
              </div>
              <p
                className="mt-1 truncate text-xxs text-gray-500"
                title={entry.validator ?? entry.detail}
              >
                {entry.validator ? (
                  <>
                    <span className={success ? 'text-green-800' : 'text-gray-800'}>
                      {shortenAddress(
                        normalizeValidatorAddress(entry.validator) ?? entry.validator,
                      )}
                    </span>
                    <span className="mx-1.5 text-gray-400">·</span>
                    {entry.summary ?? 'Validator signature observed'}
                  </>
                ) : (
                  eventPreview(entry)
                )}
              </p>
              {clock !== undefined && (
                <p className="mt-1 text-xxs text-gray-500">
                  Block time{' '}
                  <time dateTime={new Date(clock).toISOString()}>
                    {utcDate(clock)} · {utcTime(clock)} UTC
                  </time>
                </p>
              )}
            </div>
            <div className={styles.timing}>
              {sinceDispatch !== undefined ? (
                <>
                  <span
                    title={`${sinceDispatch.toLocaleString()} ms since dispatch${repeated ? ' at the last report in this group' : ''}`}
                    className="text-xs font-medium tabular-nums text-primary-600"
                  >
                    +{formatPreciseElapsed(sinceDispatch)}
                  </span>
                  {sincePrevious !== undefined && (
                    <span
                      className="text-xxs tabular-nums text-gray-500"
                      title={`${sincePrevious.toLocaleString()} ms since the previous activity${repeated ? '; includes all reports in this group' : ''}`}
                    >
                      +{formatPreciseElapsed(sincePrevious)} since previous
                    </span>
                  )}
                </>
              ) : (
                <span className="text-xxs text-gray-500">
                  {eventTime !== undefined
                    ? 'Before dispatch time'
                    : entry.status === 'complete'
                      ? 'Observation not recorded'
                      : '—'}
                </span>
              )}
            </div>
          </summary>
          {open && (
            <div
              className={
                entry.offchainRead ? 'mb-3 mt-1 border-t border-gray-200 pt-3' : styles.expansion
              }
            >
              {entry.offchainRead ? (
                <CcipReadDetails read={entry.offchainRead} />
              ) : (
                <p className="text-xs leading-relaxed text-gray-700">{entry.detail}</p>
              )}
              {entry.reorgResults && (
                <dl aria-label="Validator reorg results" className="mt-3 space-y-1 text-xxs">
                  {entry.reorgResults.map(({ validator, result }) => (
                    <div key={validator} className="flex flex-wrap justify-between gap-x-3">
                      <dt className="break-all font-mono text-gray-800">{validator}</dt>
                      <dd className="text-gray-600">{result}</dd>
                    </div>
                  ))}
                </dl>
              )}
              <dl className="mt-3 grid gap-3 text-xxs sm:grid-cols-2">
                {entry.timestamp !== undefined && (
                  <Detail
                    label={
                      entry.timeSource === 'chain' ? 'Block timestamp (UTC)' : 'Observed at (UTC)'
                    }
                    value={entry.timestampRaw ?? new Date(entry.timestamp).toISOString()}
                  />
                )}
                {entry.blockTimestamp !== undefined && entry.timeSource !== 'chain' && (
                  <Detail
                    label="Block timestamp (UTC)"
                    value={new Date(entry.blockTimestamp).toISOString()}
                  />
                )}
                {repeated && entry.endTimestamp !== undefined && (
                  <Detail
                    label="Last report (UTC)"
                    value={new Date(entry.endTimestamp).toISOString()}
                  />
                )}
                {entry.relayer && <Detail label="Reporting relayer" value={entry.relayer} />}
                {entry.validator && <Detail label="Validator" value={entry.validator} />}
                {entry.ism && <Detail label="ISM" value={entry.ism} />}
                {entry.timestamp === undefined && (
                  <Detail
                    label="Relayer observation"
                    value="Not recorded. Block time is not used as an observation time."
                  />
                )}
              </dl>
              {!!entry.rows.length && (
                <div className="mt-3 border-t border-gray-200 pt-3">
                  <p className="mb-2 text-xxs font-medium text-gray-600">
                    {repeated ? 'Repeated observations' : 'Source records'}
                  </p>
                  {entry.rows.map((row) => (
                    <ActivityRecord key={row.id} row={row} />
                  ))}
                </div>
              )}
            </div>
          )}
        </details>
      </div>
    </li>
  );
}

function ActivityRecord({ row }: { row: DiagnosticActivity }) {
  const [open, setOpen] = useState(false);
  return (
    <details
      className="border-t border-gray-200/60 first:border-0"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2 text-xxs text-gray-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500">
        <span>
          {describeDiagnosticActivity(row).label} <span className="text-gray-500">· #{row.id}</span>
        </span>
        <time className="break-all tabular-nums" dateTime={row.observed_at}>
          {row.observed_at}
        </time>
      </summary>
      {open && (
        <>
          <p className="mb-2 break-all text-xxs text-gray-500">
            Received by diagnostics: {row.received_at ?? 'Not recorded'}
          </p>
          <pre className="mb-2 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded border border-gray-200 bg-white p-3 text-xxs leading-relaxed text-gray-700">
            {JSON.stringify(row.activity, null, 2)}
          </pre>
        </>
      )}
    </details>
  );
}

function CcipReadDetails({ read }: { read: NonNullable<TimelineEntry['offchainRead']> }) {
  return (
    <dl
      aria-label="CCIP Read details"
      className="grid grid-cols-2 gap-x-4 gap-y-3 border-b border-gray-200 pb-3 text-xs empty:hidden sm:grid-cols-4"
    >
      {read.endpoint != null && <Detail label="Endpoint" value={read.endpoint + 1} />}
      {read.attempt != null && read.attempt > 0 && <Detail label="Attempt" value={read.attempt} />}
      {read.http_status != null && <Detail label="HTTP status" value={read.http_status} />}
      {read.result && (
        <Detail
          label="Proof size"
          value={`${read.result.bytes} ${read.result.bytes === 1 ? 'byte' : 'bytes'}`}
        />
      )}
      {read.hostname && <Detail label="Gateway" value={read.hostname} fullWidth />}
      {read.url_template && (
        <Detail label="Gateway URL template" value={<code>{read.url_template}</code>} fullWidth />
      )}
      {read.result && (
        <Detail
          label="Proof hash (Keccak-256)"
          value={<code>{read.result.keccak256}</code>}
          fullWidth
        />
      )}
    </dl>
  );
}

function Detail({
  label,
  value,
  fullWidth,
}: {
  label: string;
  value: ReactNode;
  fullWidth?: boolean;
}) {
  return (
    <div
      className={clsx(
        'min-w-0',
        fullWidth && 'col-span-full sm:grid sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-x-3',
      )}
    >
      <dt className="text-gray-500">{label}</dt>
      <dd className={clsx('mt-1 break-all text-gray-800', fullWidth && 'sm:mt-0')}>{value}</dd>
    </div>
  );
}
function utcTime(timestamp: number) {
  return new Date(timestamp).toISOString().slice(11, 23);
}

function elapsed(from: number | undefined, to: number | undefined) {
  return from !== undefined && from > 0 && to !== undefined && to >= from ? to - from : undefined;
}

function eventPreview(entry: TimelineEntry): string {
  if (entry.summary) return entry.summary;
  switch (entry.kind) {
    case 'dispatch':
      return 'Message emitted on the origin chain';
    case 'pickup':
      return entry.relayer
        ? `${getRelayerLabel(entry.relayer)} · first seen`
        : 'Awaiting a relayer observation';
    case 'delivery':
      return entry.status === 'complete'
        ? 'Message executed on the destination chain'
        : 'Awaiting execution on the destination chain';
    case 'validation':
      return entry.status === 'complete'
        ? 'Security module requirements satisfied'
        : 'Preparing verification data';
    default: {
      const latest = entry.rows[entry.rows.length - 1]?.activity.state;
      if (latest?.failure?.reason) return diagnosticLabel(latest.failure.reason);
      if (latest?.phase === 'delivered') return 'Destination mailbox rechecked by relayer';
      if (latest?.retry?.reason) return `Retry: ${diagnosticLabel(latest.retry.reason)}`;
      if (latest?.submission?.stage) return 'Destination transaction progress';
      return 'Verification progress · expand for details';
    }
  }
}
function utcDate(timestamp?: number) {
  return timestamp === undefined
    ? undefined
    : new Date(timestamp).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      });
}
