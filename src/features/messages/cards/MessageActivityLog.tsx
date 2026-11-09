import { shortenAddress } from '@hyperlane-xyz/utils';
import { CopyButton } from '@hyperlane-xyz/widgets';
import { useMemo, useState, type ReactNode } from 'react';

import { formatElapsed, formatTimestamp, getActivityTimings } from '../diagnostics/timeline';
import {
  describeDiagnosticActivity,
  diagnosticLabel,
  mergeActivityHistory,
  type DiagnosticActivity,
} from '../diagnostics/types';
import type { useMessageActivityPage } from '../diagnostics/useMessageDiagnostics';

const VISIBLE_ROWS = 8;

export function MessageActivityLog({
  history,
  dispatchedAt,
  deliveredAt,
  liveActivities,
  controls,
  header,
}: {
  history: ReturnType<typeof useMessageActivityPage>;
  dispatchedAt: number;
  deliveredAt?: number;
  liveActivities: DiagnosticActivity[];
  controls?: ReactNode;
  header: ReactNode;
}) {
  // Freeze the latest batch while browsing older records; its cursor must stay paired
  // with those rows even when the live query receives a newer 50-record batch.
  const [frozenLatest, setFrozenLatest] = useState<typeof history.activityPage>(null);
  const [view, setView] = useState<{ page: number; offset: number | 'oldest' }>({
    page: history.page,
    offset: 0,
  });
  const liveBatch = useMemo(
    () =>
      history.page === 0 && history.activityPage
        ? {
            ...history.activityPage,
            activities: mergeActivityHistory(history.activityPage.activities, liveActivities),
          }
        : history.activityPage,
    [history.activityPage, history.page, liveActivities],
  );
  const batch = history.page === 0 ? (frozenLatest ?? liveBatch) : history.activityPage;
  const batchRows = useMemo(
    () =>
      [...(batch?.activities ?? [])].sort((a, b) =>
        BigInt(a.id) < BigInt(b.id) ? 1 : BigInt(a.id) > BigInt(b.id) ? -1 : 0,
      ),
    [batch],
  );
  const selectedOffset = view.page === history.page ? view.offset : 0;
  const offset =
    selectedOffset === 'oldest'
      ? Math.max(0, Math.floor((batchRows.length - 1) / VISIBLE_ROWS) * VISIBLE_ROWS)
      : selectedOffset;
  const { timings, previousReports } = useMemo(() => {
    const timings = getActivityTimings(batchRows, dispatchedAt, deliveredAt);
    const previousReports = new Map<string, { id: string; timestamp: number; elapsed: number }>();
    const lastByRelayer = new Map<string, string>();
    // This complete server batch proves adjacency; sparse cached pages or socket anchors do not.
    for (const row of [...batchRows].reverse()) {
      const previousId = lastByRelayer.get(row.relayer);
      const previousTimestamp = previousId ? timings.get(previousId)?.timestamp : undefined;
      const timestamp = timings.get(row.id)?.timestamp;
      if (
        previousId !== undefined &&
        previousTimestamp !== undefined &&
        timestamp !== undefined &&
        timestamp >= previousTimestamp
      ) {
        previousReports.set(row.id, {
          id: previousId,
          timestamp: previousTimestamp,
          elapsed: timestamp - previousTimestamp,
        });
      }
      // An unrecorded timestamp must break the interval, not skip back to an older report.
      lastByRelayer.set(row.relayer, row.id);
    }
    return { timings, previousReports };
  }, [batchRows, dispatchedAt, deliveredAt]);
  const rows = batchRows.slice(offset, offset + VISIBLE_ROWS).sort((a, b) => {
    const aTime = timings.get(a.id)?.timestamp;
    const bTime = timings.get(b.id)?.timestamp;
    // Missing timestamps stay in a separate bucket so the comparator is transitive.
    if (aTime === undefined && bTime !== undefined) return 1;
    if (aTime !== undefined && bTime === undefined) return -1;
    if (aTime !== undefined && bTime !== undefined && aTime !== bTime) return aTime - bTime;
    return BigInt(a.id) < BigInt(b.id) ? -1 : BigInt(a.id) > BigInt(b.id) ? 1 : 0;
  });
  const earlierInBatch = offset + VISIBLE_ROWS < batchRows.length;
  const hasEarlier = earlierInBatch || !!(batch?.has_more && batch.next_before_id);
  const browsing = history.page > 0 || offset > 0 || frozenLatest !== null;
  const earlier = () => {
    if (history.page === 0 && !frozenLatest) setFrozenLatest(liveBatch);
    if (earlierInBatch) {
      setView({ page: history.page, offset: offset + VISIBLE_ROWS });
    } else if (batch?.next_before_id) {
      setView({ page: history.page + 1, offset: 0 });
      history.next(batch.next_before_id);
    }
  };
  const later = () => {
    if (offset > 0) {
      setView({ page: history.page, offset: Math.max(0, offset - VISIBLE_ROWS) });
    } else {
      setView({ page: history.page - 1, offset: 'oldest' });
      history.previous();
    }
  };
  const latest = () => {
    setFrozenLatest(null);
    setView({ page: 0, offset: 0 });
    history.latest();
  };

  return (
    <section className="min-w-0" aria-label="Relayer activity and logs">
      {header}
      <div className="mt-3">
        {controls}
        <nav
          aria-label="Activity pages"
          className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-gray-200 pt-2 text-xs text-gray-500"
        >
          <div>
            <h3 className="font-medium text-gray-700">Observations · all relayers</h3>
            <p className="mt-0.5 text-xxs">
              {browsing ? 'Earlier activity' : 'Latest activity'} · {rows.length} records · elapsed
              from dispatch
            </p>
          </div>
          <div className="flex items-center gap-2">
            {browsing && (
              <button
                type="button"
                onClick={latest}
                disabled={history.fetching}
                className="rounded px-2 py-1.5 text-primary-700 disabled:opacity-40"
              >
                Latest
              </button>
            )}
            <button
              type="button"
              onClick={earlier}
              disabled={!hasEarlier || history.fetching}
              className="rounded border border-gray-300 px-3 py-1.5 text-gray-700 disabled:cursor-default disabled:opacity-40"
            >
              ← Earlier
            </button>
            <button
              type="button"
              onClick={later}
              disabled={(history.page === 0 && offset === 0) || history.fetching}
              className="rounded border border-gray-300 px-3 py-1.5 text-gray-700 disabled:cursor-default disabled:opacity-40"
            >
              Later →
            </button>
          </div>
        </nav>
        <p className="mt-1 text-xxs text-gray-500">
          Earlier to later within each view. Reports may arrive after delivery.
        </p>
        {history.error && (
          <p role="alert" className="mt-3 text-sm text-red-700">
            Activity could not be loaded. Live message tracking continues.
          </p>
        )}
        {!rows.length && !history.error && (
          <p className="py-5 text-sm text-gray-500">
            {history.fetching
              ? 'Loading activity…'
              : 'No relayer activity recorded for this message.'}
          </p>
        )}
        {!!rows.length && (
          <ol
            className="mt-2 divide-y divide-gray-200/70 border-y border-gray-200/70"
            aria-label="Relayer activity log"
          >
            {rows.map((row) => {
              const timing = timings.get(row.id);
              const previousReport = previousReports.get(row.id);
              const description = describeDiagnosticActivity(row);
              return (
                <li key={row.id}>
                  <details className="group/activity overflow-hidden open:bg-gray-150/40">
                    <summary className="flex min-h-10 cursor-pointer list-none items-start gap-2 px-2 py-2 text-xs sm:items-center transition-colors hover:bg-gray-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500 [&::-webkit-details-marker]:hidden">
                      <span className="w-20 shrink-0 break-words font-medium tabular-nums text-primary-700 sm:w-24">
                        <span className="sr-only">Since dispatch: </span>
                        {timing?.sinceDispatch === undefined
                          ? '—'
                          : `+${formatElapsed(timing.sinceDispatch)}`}
                        {previousReport && (
                          <span
                            className="mt-0.5 block text-xxs font-normal leading-4 text-gray-500"
                            title={`Since prior report #${previousReport.id} from this relayer: ${new Date(previousReport.timestamp).toISOString()} → ${new Date(previousReport.timestamp + previousReport.elapsed).toISOString()} (${previousReport.elapsed} ms). Recorded update interval, not stage execution time.`}
                          >
                            {formatElapsed(previousReport.elapsed)} later
                            <span className="sr-only"> than this relayer’s prior report</span>
                          </span>
                        )}
                      </span>
                      <span className="min-w-0 flex-1 sm:grid sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-4">
                        <span className="block font-medium leading-5 text-gray-800">
                          {description.label}
                        </span>
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xxs leading-4 text-gray-500 sm:justify-end sm:whitespace-nowrap">
                          <time
                            className="tabular-nums"
                            dateTime={
                              timing?.timestamp === undefined
                                ? undefined
                                : new Date(timing.timestamp).toISOString()
                            }
                            title={`Observed at ${row.observed_at}`}
                          >
                            {timing?.timestamp === undefined
                              ? 'Observation time unavailable'
                              : `${formatTimestamp(timing.timestamp)} local`}
                          </time>
                          <span aria-hidden="true">·</span>
                          <span className="break-all" title={`Reporting relayer: ${row.relayer}`}>
                            <span className="sr-only">Reporting relayer: </span>
                            {shortenAddress(row.relayer)}
                          </span>
                        </span>
                      </span>
                      <span
                        className="shrink-0 text-base leading-none text-gray-400 transition-transform group-open/activity:rotate-90 motion-reduce:transition-none"
                        aria-hidden="true"
                      >
                        ›
                      </span>
                    </summary>
                    <div className="border-t border-gray-200 bg-gray-150/50 px-4 py-4">
                      <p className="text-xs leading-relaxed text-gray-700">{description.detail}</p>
                      {timing?.afterDelivery !== undefined && (
                        <p className="mt-1 text-xs text-gray-500">
                          Reported {formatElapsed(timing.afterDelivery)} after delivery.
                        </p>
                      )}
                      <dl className="mt-4 grid gap-x-6 gap-y-3 text-xs sm:grid-cols-2">
                        <div className="min-w-0">
                          <dt className="text-gray-500">Reporting relayer</dt>
                          <dd className="mt-1 flex items-center gap-2 break-all text-gray-800">
                            {row.relayer}
                            <CopyButton
                              copyValue={row.relayer}
                              width={12}
                              height={12}
                              aria-label="Copy reporting relayer"
                              className="shrink-0 text-gray-500 [&_rect]:stroke-current [&_path]:fill-current"
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
        )}
      </div>
    </section>
  );
}
