import { shortenAddress } from '@hyperlane-xyz/utils';
import { useMemo } from 'react';

import type { Message, MessageStub } from '../../../types';
import { buildMessageActivityTimeline } from '../diagnostics/activityTimeline';
import { useMessageDiagnosticsContext } from '../diagnostics/MessageDiagnosticsContext';
import { diagnosticsConnectionLabel } from '../diagnostics/progress';
import { diagnosticLabel } from '../diagnostics/types';
import { MessageActivityTimeline } from './MessageActivityTimeline';

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
  const entries = useMemo(
    () => buildMessageActivityTimeline({ message, observation, activities }),
    [message, observation, activities],
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
        </p>
      )}
      {history.fetching && !activities.length && (
        <output className="mb-4 block text-xs text-gray-500">Loading relayer activity…</output>
      )}

      <MessageActivityTimeline
        entries={entries}
        dispatchedAt={message.origin.timestamp}
        header={
          <div className="flex min-w-0 flex-wrap items-center gap-2 text-xxs text-gray-600">
            <label htmlFor={`reporter-${message.msgId}`}>Relayer</label>
            <select
              id={`reporter-${message.msgId}`}
              value={selectedRelayer}
              onChange={(event) => setSelectedRelayer(event.target.value)}
              className="min-w-0 max-w-[14rem] rounded border border-gray-200 bg-white py-1.5 pl-2 pr-6 text-xxs focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500"
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
          Relayer steps use observation times. Purple shows time since dispatch; gray shows time
          since the previous activity. Collapsed groups include the full wait. Expand a step for its
          exact timestamps and source. Signature observations do not record when a validator signed.
        </p>
      </footer>
    </section>
  );
}
