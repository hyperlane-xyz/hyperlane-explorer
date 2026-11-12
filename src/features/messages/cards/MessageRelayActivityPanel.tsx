import { useMemo } from 'react';

import type { Message, MessageStub } from '../../../types';
import { buildMessageActivityTimeline } from '../diagnostics/activityTimeline';
import { useMessageDiagnosticsContext } from '../diagnostics/MessageDiagnosticsContext';
import { diagnosticsConnectionLabel } from '../diagnostics/progress';
import { MessageActivityTimeline } from './MessageActivityTimeline';
import { RelayerSelector } from './RelayerSelector';

export function MessageRelayActivityPanel({ message }: { message: Message | MessageStub }) {
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
  const entries = useMemo(
    () => buildMessageActivityTimeline({ message, observation, activities, historyComplete }),
    [message, observation, activities, historyComplete],
  );
  const historyLimitReached = activities.length >= 1000;
  const canLoadEarlier =
    !historyLimitReached &&
    !!(history.activityPage?.has_more && history.activityPage.next_before_id);

  return (
    <section aria-label="Message timeline" className="min-w-0">
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
            ? 'History is incomplete. First signature discovery times are unknown.'
            : 'Loading complete history to find the first signature discoveries…'}
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
          Times show the selected relayer’s first recorded discoveries. Purple shows time since
          dispatch; gray shows time since the immediately previous activity. Signing and upload
          times are not recorded.
        </p>
      </footer>
    </section>
  );
}
