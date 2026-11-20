import { useMemo } from 'react';

import type { Message, MessageStub } from '../../../types';
import { buildMessageActivityTimeline } from '../diagnostics/activityTimeline';
import { useMessageDiagnosticsContext } from '../diagnostics/MessageDiagnosticsContext';
import { diagnosticsConnectionLabel } from '../diagnostics/progress';
import { formatPreciseElapsed } from '../diagnostics/timeline';
import type { OriginConfirmation } from '../diagnostics/useOriginConfirmation';
import { MessageActivityTimeline } from './MessageActivityTimeline';
import { RelayerSelector } from './RelayerSelector';

export function MessageRelayActivityPanel({
  message,
  originConfirmation,
}: {
  message: Message | MessageStub;
  originConfirmation?: OriginConfirmation;
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
  const historyComplete = history.complete && activities.length < 1000;
  const { entries, totalElapsed, pickupToSubmission, ismValidationTime } = useMemo(() => {
    const timeline = buildMessageActivityTimeline({
      message,
      observation,
      activities,
      historyComplete,
      originConfirmation,
    });
    return {
      ...timeline,
      // Hide delivery until its timing can be represented consistently with relayer activity.
      entries: timeline.entries.filter((entry) => entry.kind !== 'delivery'),
    };
  }, [message, observation, activities, historyComplete, originConfirmation]);
  const historyLimitReached = activities.length >= 1000;
  const canLoadEarlier =
    !historyLimitReached &&
    !!(history.activityPage?.has_more && history.activityPage.next_before_id);
  const metrics = [
    {
      label: 'Total message time',
      elapsed: totalElapsed,
      detail: 'Origin dispatch → destination delivery',
    },
    {
      label: 'Relayer processing time',
      elapsed: pickupToSubmission,
      detail: 'First seen → first recorded submission',
    },
    {
      label: 'ISM validation time',
      elapsed: ismValidationTime,
      detail: 'ISM resolution observed → metadata ready',
    },
  ];

  return (
    <section aria-label="Message timeline" className="min-w-0">
      <dl aria-label="Message timing metrics" className="mb-4 grid gap-2 sm:grid-cols-3 sm:gap-3">
        {metrics.map(({ label, elapsed, detail }) => (
          <div key={label} className="min-w-0 rounded-lg border border-gray-200 bg-gray-150/60 p-3">
            <dt className="text-xs font-medium text-gray-600">{label}</dt>
            <dd className="mt-1 break-words text-lg font-semibold tabular-nums text-primary-800">
              {elapsed === undefined ? 'Unavailable' : formatPreciseElapsed(elapsed)}
            </dd>
            <dd className="mt-0.5 text-xxs text-gray-500">{detail}</dd>
          </div>
        ))}
      </dl>
      {history.error && (
        <p role="alert" className="mb-4 text-xs text-red-700">
          Activity could not be loaded. Recorded chain milestones remain visible.
          <button type="button" onClick={history.retry} className="ml-2 underline">
            Retry loading history
          </button>
        </p>
      )}
      {history.fetching && !activities.length && (
        <output className="mb-4 block text-xs text-gray-500">Loading relayer activity…</output>
      )}

      {!historyComplete && (
        <output className="mb-4 block text-xs text-gray-600">
          {history.error || historyLimitReached
            ? 'History is incomplete. Some activity times are unknown.'
            : 'Loading earlier history to determine activity times…'}
        </output>
      )}
      <MessageActivityTimeline
        entries={entries}
        dispatchedAt={message.origin.timestamp}
        header={
          <div className="flex min-w-0 max-w-full flex-wrap items-center gap-x-3 gap-y-2 text-xxs text-gray-600">
            <RelayerSelector
              observation={observation}
              relayers={relayers}
              value={selectedRelayer}
              onChange={setSelectedRelayer}
            />
            <span className="text-gray-500">{diagnosticsConnectionLabel(connectionState)}</span>
          </div>
        }
      />

      <footer className="mt-4 border-t border-gray-200 pt-3">
        {canLoadEarlier && (
          <button
            type="button"
            onClick={() => history.next()}
            disabled={history.fetching}
            className="mb-3 w-full rounded border border-gray-200 py-2 text-xs text-gray-700 transition-colors hover:bg-gray-150 disabled:opacity-50"
          >
            {history.fetching ? 'Loading earlier activity…' : 'Load earlier activity'}
          </button>
        )}
        <p className="text-xxs leading-relaxed text-gray-500">
          Times reflect the selected relayer’s recorded activity. Purple shows time since dispatch;
          gray shows time since the immediately previous activity. Signing and upload times are not
          recorded.
        </p>
      </footer>
    </section>
  );
}
