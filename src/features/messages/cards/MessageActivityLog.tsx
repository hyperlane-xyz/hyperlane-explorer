import { shortenAddress } from '@hyperlane-xyz/utils';
import { CopyButton } from '@hyperlane-xyz/widgets';
import { useMemo, useState } from 'react';

import { formatElapsed, formatTimestamp, getActivityTimings } from '../diagnostics/timeline';
import { describeDiagnosticActivity, diagnosticLabel } from '../diagnostics/types';
import type { useMessageActivityPage } from '../diagnostics/useMessageDiagnostics';

const columns = 'sm:grid-cols-[minmax(0,1fr)_7rem_8rem_7rem_1rem]';

export function MessageActivityLog({
  history,
  dispatchedAt,
  deliveredAt,
  deliveryDuration,
}: {
  history: ReturnType<typeof useMessageActivityPage>;
  dispatchedAt: number;
  deliveredAt?: number;
  deliveryDuration?: number;
}) {
  const [open, setOpen] = useState(false);
  const timings = useMemo(
    () => getActivityTimings(history.activityPage?.activities ?? [], dispatchedAt, deliveredAt),
    [history.activityPage, dispatchedAt, deliveredAt],
  );
  const rows = [...(history.activityPage?.activities ?? [])].sort((a, b) => {
    const aTime = timings.get(a.id)?.timestamp;
    const bTime = timings.get(b.id)?.timestamp;
    return aTime !== undefined && bTime !== undefined && aTime !== bTime
      ? aTime - bTime
      : BigInt(a.id) < BigInt(b.id)
        ? -1
        : BigInt(a.id) > BigInt(b.id)
          ? 1
          : 0;
  });

  return (
    <details
      className="group/log mt-4 border-t border-gray-300/60 pt-4"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm text-gray-700 [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2">
          <span
            className="text-primary-700 transition-transform group-open/log:rotate-90"
            aria-hidden="true"
          >
            ›
          </span>
          Relayer activity &amp; logs
        </span>
        <span className="text-xs text-gray-500">
          {history.fetching ? 'Updating…' : `${rows.length} observations`}
        </span>
      </summary>
      {open && (
        <div className="mt-4">
          <div className="flex flex-wrap items-start justify-between gap-3 rounded bg-gray-150 px-3 py-3 text-xs leading-relaxed text-gray-600">
            <p className="max-w-2xl">
              Earlier → later on each page. Elapsed time starts at dispatch. Later relayer reports
              do not extend the on-chain delivery time.
            </p>
            {deliveryDuration !== undefined && (
              <p className="shrink-0 font-medium text-green-700">
                Delivered in {formatElapsed(deliveryDuration)}
              </p>
            )}
          </div>
          {history.error && (
            <p role="alert" className="mt-3 text-sm text-red-700">
              Activity could not be loaded. Live message tracking continues.
            </p>
          )}
          {!rows.length && (
            <p className="py-5 text-sm text-gray-500">
              {history.fetching
                ? 'Loading activity…'
                : 'No relayer activity recorded for this message.'}
            </p>
          )}
          {!!rows.length && (
            <div className="mt-3 overflow-hidden rounded border border-gray-300/60">
              <div
                className={`hidden gap-3 border-b border-gray-200 bg-gray-150 px-3 py-2 text-xs text-gray-500 sm:grid ${columns}`}
                aria-hidden="true"
              >
                <span>Activity</span>
                <span>Since dispatch</span>
                <span>Observed (local)</span>
                <span>Relayer</span>
                <span />
              </div>
              <ol aria-label="Relayer activity log">
                {rows.map((row) => {
                  const timing = timings.get(row.id);
                  const description = describeDiagnosticActivity(row);
                  return (
                    <li key={row.id} className="border-b border-gray-200 last:border-b-0">
                      <details className="group/activity">
                        <summary
                          className={`grid cursor-pointer list-none grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-2 px-3 py-3 text-xs transition-colors hover:bg-gray-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500 [&::-webkit-details-marker]:hidden ${columns}`}
                        >
                          <span className="font-medium text-gray-800">{description.label}</span>
                          <span className="text-right tabular-nums text-gray-800 sm:text-left">
                            <span className="sm:hidden">Dispatch +</span>
                            {timing?.sinceDispatch === undefined
                              ? '—'
                              : formatElapsed(timing.sinceDispatch)}
                            {timing?.afterDelivery !== undefined && (
                              <span className="mt-1 block text-xxs leading-relaxed text-gray-500">
                                {formatElapsed(timing.afterDelivery)} after delivery
                              </span>
                            )}
                          </span>
                          <time
                            className="tabular-nums text-gray-500"
                            dateTime={
                              timing?.timestamp === undefined
                                ? undefined
                                : new Date(timing.timestamp).toISOString()
                            }
                            title={row.observed_at}
                          >
                            {timing?.timestamp === undefined
                              ? '—'
                              : formatTimestamp(timing.timestamp)}
                          </time>
                          <span
                            className="text-right text-gray-500 sm:text-left"
                            title={row.relayer}
                          >
                            {shortenAddress(row.relayer)}
                          </span>
                          <span
                            className="hidden text-right text-primary-700 transition-transform group-open/activity:rotate-90 sm:block"
                            aria-hidden="true"
                          >
                            ›
                          </span>
                        </summary>
                        <div className="border-t border-gray-200 bg-gray-150/50 px-4 py-4">
                          <p className="text-xs leading-relaxed text-gray-700">
                            {description.detail}
                          </p>
                          <dl className="mt-4 grid gap-x-6 gap-y-3 text-xs sm:grid-cols-2">
                            <div className="min-w-0">
                              <dt className="text-gray-500">Reporting relayer</dt>
                              <dd className="mt-1 flex items-center gap-2 break-all text-gray-800">
                                {row.relayer}
                                <CopyButton
                                  copyValue={row.relayer}
                                  width={12}
                                  height={12}
                                  className="shrink-0 opacity-50"
                                />
                              </dd>
                            </div>
                            <div>
                              <dt className="text-gray-500">Observed at</dt>
                              <dd className="mt-1 break-words tabular-nums text-gray-800">
                                {timing?.timestamp === undefined
                                  ? row.observed_at
                                  : new Date(timing.timestamp).toLocaleString()}
                              </dd>
                            </div>
                            <div>
                              <dt className="text-gray-500">Record</dt>
                              <dd className="mt-1 text-gray-800">
                                #{row.id} · {diagnosticLabel(row.activity.type)}
                              </dd>
                            </div>
                            {timing?.ingestionDelay !== undefined && (
                              <div>
                                <dt className="text-gray-500">Observation → database</dt>
                                <dd className="mt-1 tabular-nums text-gray-800">
                                  {formatElapsed(timing.ingestionDelay)}
                                </dd>
                              </div>
                            )}
                          </dl>
                          <details className="mt-4 border-t border-gray-200 pt-3">
                            <summary className="cursor-pointer text-xs text-gray-600">
                              Raw activity JSON
                            </summary>
                            <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-all rounded bg-white/70 p-3 text-xxs leading-relaxed text-gray-700">
                              {JSON.stringify(row.activity, null, 2)}
                            </pre>
                          </details>
                        </div>
                      </details>
                    </li>
                  );
                })}
              </ol>
            </div>
          )}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-gray-500">
            <span>
              {history.page === 0
                ? 'Latest activity'
                : `Earlier activity · page ${history.page + 1}`}
              {history.activityPage?.has_more ? ' · Earlier records available' : ''}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={history.next}
                disabled={!history.activityPage?.has_more || history.fetching}
                className="rounded border border-gray-300 px-3 py-1.5 text-gray-700 disabled:cursor-default disabled:opacity-40"
              >
                ← Earlier
              </button>
              <button
                type="button"
                onClick={history.previous}
                disabled={history.page === 0 || history.fetching}
                className="rounded border border-gray-300 px-3 py-1.5 text-gray-700 disabled:cursor-default disabled:opacity-40"
              >
                Later →
              </button>
            </div>
          </div>
        </div>
      )}
    </details>
  );
}
