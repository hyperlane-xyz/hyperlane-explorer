import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from 'urql';

import { useExplorerEvents } from '../queries/useLiveMessages';
import {
  DiagnosticActivity,
  DiagnosticObservations,
  MessageDiagnostics,
  RelayerDiagnosticState,
  mergeActivityHistory,
  messageActivityPageSchema,
  messageDiagnosticsSchema,
  normalizeDiagnosticMessageId,
  reconcileDiagnosticObservations,
  reduceMessageDiagnostics,
} from './types';

const DIAGNOSTICS_QUERY = `
  query MessageDiagnostics($messageId: String!) {
    message_diagnostics(message_id: $messageId) {
      version message_id partial
      activities { id message_id relayer observed_at received_at version activity }
    }
  }
`;
const ACTIVITY_QUERY = `
  query MessageActivity($messageId: String!, $beforeId: String, $limit: Int!) {
    message_activity(message_id: $messageId, before_id: $beforeId, limit: $limit) {
      message_id has_more next_before_id
      activities { id message_id relayer observed_at received_at version activity }
    }
  }
`;
const HISTORY_PAGE_SIZE = 50;

export type DiagnosticsConnectionState = 'historical' | 'connecting' | 'live' | 'disconnected';
export interface MessageDiagnosticsResult {
  diagnostics: MessageDiagnostics | null;
  relayers: RelayerDiagnosticState[];
  connectionState: DiagnosticsConnectionState;
  fetching: boolean;
  error?: string;
}

export function useMessageDiagnostics(
  messageId: string,
  live: boolean,
  enabled = true,
): MessageDiagnosticsResult {
  const { subscribeDiagnostics } = useExplorerEvents();
  const [stream, setStream] = useState<{ messageId: string; result: MessageDiagnosticsResult }>();
  const [{ data, fetching, error }] = useQuery<{ message_diagnostics: unknown }>({
    query: DIAGNOSTICS_QUERY,
    variables: { messageId },
    requestPolicy: 'network-only',
    pause: !enabled || live,
  });
  useEffect(() => {
    if (!enabled || !live) return;
    const update = (change: Partial<MessageDiagnosticsResult>) =>
      setStream((previous) => ({
        messageId,
        result: {
          diagnostics: null,
          relayers: [],
          connectionState: 'connecting',
          fetching: true,
          ...(previous?.messageId === messageId ? previous.result : {}),
          ...change,
        },
      }));
    update({ connectionState: 'connecting', fetching: true, error: undefined });
    return subscribeDiagnostics((event) => {
      if (!event) {
        update({ connectionState: 'disconnected', fetching: true });
        return;
      }
      if (event.type === 'diagnostics_unavailable') {
        update({ connectionState: 'connecting', fetching: true });
        return;
      }
      const parsed = messageDiagnosticsSchema.safeParse(event.data);
      if (
        !parsed.success ||
        normalizeDiagnosticMessageId(parsed.data.message_id) !==
          normalizeDiagnosticMessageId(messageId)
      ) {
        update({ connectionState: 'disconnected', fetching: false, error: 'Invalid diagnostics' });
        return;
      }
      setStream((previous) => {
        const before = previous?.messageId === messageId ? previous.result : undefined;
        const retained: DiagnosticObservations | undefined = before
          ? { partial: before.diagnostics?.partial ?? false, relayers: before.relayers }
          : undefined;
        const next = reconcileDiagnosticObservations(
          retained,
          reduceMessageDiagnostics(parsed.data),
        );
        return {
          messageId,
          result: {
            diagnostics: { ...parsed.data, partial: next.partial },
            relayers: next.relayers,
            connectionState: 'live',
            fetching: false,
          },
        };
      });
    });
  }, [enabled, live, messageId, subscribeDiagnostics]);

  if (!enabled)
    return { diagnostics: null, relayers: [], connectionState: 'historical', fetching: false };

  const streamResult = stream?.messageId === messageId ? stream.result : undefined;
  if (live)
    return {
      diagnostics: streamResult?.diagnostics ?? null,
      relayers: streamResult?.relayers ?? [],
      connectionState: streamResult?.connectionState ?? 'connecting',
      fetching: streamResult?.fetching ?? true,
      error: streamResult?.error,
    };

  const parsed = messageDiagnosticsSchema.safeParse(data?.message_diagnostics);
  if (
    parsed.success &&
    normalizeDiagnosticMessageId(parsed.data.message_id) === normalizeDiagnosticMessageId(messageId)
  ) {
    const observations = reduceMessageDiagnostics(parsed.data);
    return {
      diagnostics: { ...parsed.data, partial: observations.partial },
      relayers: observations.relayers,
      connectionState: 'historical',
      fetching: false,
    };
  }
  return {
    diagnostics: streamResult?.diagnostics ?? null,
    relayers: streamResult?.relayers ?? [],
    connectionState: 'historical',
    fetching,
    error: error?.message ?? (data ? 'Invalid diagnostics response' : undefined),
  };
}

export function useMessageActivityPage(messageId: string, enabled = true, loadHistory = false) {
  const [pagination, setPagination] = useState<{
    messageId: string;
    page: number;
    cursors: Array<string | null>;
  }>({ messageId, page: 0, cursors: [null] });
  const [history, setHistory] = useState<{
    messageId: string;
    rows: DiagnosticActivity[];
    complete: boolean;
  }>({
    messageId,
    rows: [],
    complete: false,
  });
  const current =
    pagination.messageId === messageId ? pagination : { messageId, page: 0, cursors: [null] };
  const beforeId = current.cursors[current.page] ?? null;
  const [{ data, fetching, error, operation }, refreshHistory] = useQuery<{
    message_activity: unknown;
  }>({
    query: ACTIVITY_QUERY,
    variables: { messageId, beforeId, limit: loadHistory ? 500 : HISTORY_PAGE_SIZE },
    requestPolicy: 'network-only',
    pause: !enabled,
  });
  const activityResult = useMemo(() => {
    if (data?.message_activity === undefined) return { page: null };
    const parsed = messageActivityPageSchema.safeParse(data.message_activity);
    if (!parsed.success) return { page: null, error: 'Activity response was invalid' };
    if (
      normalizeDiagnosticMessageId(parsed.data.message_id) !==
      normalizeDiagnosticMessageId(messageId)
    )
      return { page: null, error: 'Activity response did not match this message' };
    return {
      page: operation?.variables?.beforeId === beforeId ? parsed.data : null,
    };
  }, [beforeId, data, messageId, operation]);
  const activityPage = activityResult.page;
  useEffect(() => {
    if (!activityPage || fetching) return;
    setHistory((previous) => {
      const previousRows = previous.messageId === messageId ? previous.rows : [];
      const ids = new Set([...previousRows, ...activityPage.activities].map((row) => row.id));
      return {
        messageId,
        rows: mergeActivityHistory(previousRows, activityPage.activities),
        complete:
          ids.size <= 1000 &&
          ((previous.messageId === messageId && previous.complete) || !activityPage.has_more),
      };
    });
  }, [activityPage, fetching, messageId]);
  useEffect(() => {
    setPagination({ messageId, page: 0, cursors: [null] });
  }, [messageId]);
  const next = useCallback(
    (beforeId?: string) => {
      const cursor = beforeId ?? activityPage?.next_before_id;
      if (fetching || !cursor || (!beforeId && !activityPage?.has_more)) return;
      setPagination((previous) => {
        const page = previous.messageId === messageId ? previous.page : 0;
        const cursors =
          previous.messageId === messageId ? previous.cursors.slice(0, page + 1) : [null];
        return { messageId, page: page + 1, cursors: [...cursors, cursor] };
      });
    },
    [activityPage, fetching, messageId],
  );
  const previous = useCallback(
    () => setPagination((value) => ({ ...value, page: Math.max(0, value.page - 1) })),
    [],
  );
  const latest = useCallback(
    () => setPagination({ messageId, page: 0, cursors: [null] }),
    [messageId],
  );
  const loadedActivities = history.messageId === messageId ? history.rows : [];
  const complete = history.messageId === messageId && history.complete;
  const loadedCount = new Set(
    [...loadedActivities, ...(activityPage?.activities ?? [])].map((row) => row.id),
  ).size;
  const retry = useCallback(
    () => refreshHistory({ requestPolicy: 'network-only' }),
    [refreshHistory],
  );
  useEffect(() => {
    const cursor = activityPage?.next_before_id;
    if (
      enabled &&
      loadHistory &&
      !fetching &&
      !error &&
      !complete &&
      activityPage?.has_more &&
      loadedCount < 1000 &&
      cursor &&
      !current.cursors.includes(cursor)
    ) {
      next(cursor);
    }
  }, [
    enabled,
    loadHistory,
    fetching,
    error,
    complete,
    activityPage,
    loadedCount,
    current.cursors,
    next,
  ]);
  return {
    activityPage,
    loadedActivities,
    complete,
    retry,
    page: current.page,
    fetching: enabled && fetching,
    error: error?.message ?? activityResult.error,
    next,
    previous,
    latest,
  };
}
