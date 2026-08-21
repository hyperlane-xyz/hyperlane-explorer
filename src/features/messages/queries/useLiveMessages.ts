import { useContext, useEffect, useMemo, useRef, useState } from 'react';

import { ExplorerConnectionState, ExplorerEventsContext } from './ExplorerEventsProvider';
import type { MessageEntry } from './fragments';

export type { ExplorerConnectionState } from './ExplorerEventsProvider';

export function useExplorerConnectionState() {
  return useExplorerEventsContext().connectionState;
}

export function useLatestMessageRows(enabled: boolean, domains: number[], refresh: () => void) {
  const { connectionState, messageRows } = useExplorerEventsContext();
  useRefreshAfterReconnect(enabled, connectionState, refresh);

  const filteredRows = useMemo(
    () =>
      enabled
        ? messageRows
            .filter(
              (row) =>
                domains.length === 0 ||
                (domains.includes(row.origin_domain_id) &&
                  domains.includes(row.destination_domain_id)),
            )
            .sort((a, b) => b.send_occurred_at.localeCompare(a.send_occurred_at))
        : [],
    [domains, enabled, messageRows],
  );

  return { connected: enabled && connectionState === 'connected', messageRows: filteredRows };
}

export function useMessageRowSubscription(
  messageId: string,
  enabled: boolean,
  refresh: () => void,
) {
  const { connectionState, messageRows, subscribe } = useExplorerEventsContext();
  useRefreshAfterReconnect(enabled, connectionState, refresh);
  const [retainedMessageRow, setRetainedMessageRow] = useState<MessageEntry | null>(null);
  const currentMessageRow = enabled
    ? messageRows.find((row) => normalizeId(row.msg_id) === normalizeId(messageId)) || null
    : null;

  useEffect(() => {
    setRetainedMessageRow(null);
    if (!enabled) return;
    return subscribe(messageId, setRetainedMessageRow);
  }, [enabled, messageId, subscribe]);

  const messageRow = selectSubscribedMessageRow(currentMessageRow, retainedMessageRow, messageId);

  return { connected: enabled && connectionState === 'connected', messageRow };
}

export function selectSubscribedMessageRow(
  currentMessageRow: MessageEntry | null,
  retainedMessageRow: MessageEntry | null,
  messageId: string,
) {
  const retainedRowMatches = normalizeId(retainedMessageRow?.msg_id) === normalizeId(messageId);
  return currentMessageRow ?? (retainedRowMatches ? retainedMessageRow : null);
}

function useRefreshAfterReconnect(
  enabled: boolean,
  connectionState: ExplorerConnectionState,
  refresh: () => void,
) {
  const refreshRef = useRef(refresh);
  const previousConnectionState = useRef(connectionState);

  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    if (shouldRefreshAfterReconnect(enabled, previousConnectionState.current, connectionState)) {
      refreshRef.current();
    }
    previousConnectionState.current = connectionState;
  }, [connectionState, enabled]);
}

export function shouldRefreshAfterReconnect(
  enabled: boolean,
  previousConnectionState: ExplorerConnectionState,
  connectionState: ExplorerConnectionState,
) {
  return enabled && previousConnectionState !== 'connected' && connectionState === 'connected';
}

function useExplorerEventsContext() {
  const context = useContext(ExplorerEventsContext);
  if (!context) throw new Error('ExplorerEventsProvider is required');
  return context;
}

function normalizeId(value: unknown) {
  return typeof value === 'string' ? value.replace(/^(?:0x|\\x)/, '').toLowerCase() : null;
}
