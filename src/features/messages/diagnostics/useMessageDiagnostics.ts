import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useClient, useQuery } from 'urql';
import { z } from 'zod';

import { config } from '../../../consts/config';
import { logger } from '../../../utils/logger';
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
const frameSchema = z.object({
  type: z.string(),
  data: z.unknown().optional(),
  message_ids: z.array(z.string()).optional(),
});
const HISTORY_PAGE_SIZE = 50;

export type DiagnosticsConnectionState = 'historical' | 'connecting' | 'live' | 'disconnected';
export interface MessageDiagnosticsResult {
  diagnostics: MessageDiagnostics | null;
  relayers: RelayerDiagnosticState[];
  connectionState: DiagnosticsConnectionState;
  fetching: boolean;
  error?: string;
}

/** A socket is live only after its snapshot arrives; unavailable sockets fall back to HTTP. */
export function connectMessageDiagnostics({
  messageId,
  live,
  wsUrl,
  fetchSnapshot,
  onSnapshot,
  onConnection,
  onError,
}: {
  messageId: string;
  live: boolean;
  wsUrl: string | null;
  fetchSnapshot: (signal: AbortSignal) => Promise<unknown>;
  onSnapshot: (snapshot: MessageDiagnostics) => void;
  onConnection: (state: DiagnosticsConnectionState) => void;
  onError: (error: string | undefined) => void;
}) {
  let stopped = false;
  let socket: WebSocket | undefined;
  let socketLive = false;
  let inFlight = false;
  let request: AbortController | undefined;
  let requestTimer: ReturnType<typeof setTimeout> | undefined;
  let streamVersion = 0;
  let reconnectDelay = 1_000;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let initialTimer: ReturnType<typeof setTimeout> | undefined;
  let heartbeatTimer: ReturnType<typeof setTimeout> | undefined;
  const id = normalizeDiagnosticMessageId(messageId);
  const read = (value: unknown) => {
    const snapshot = messageDiagnosticsSchema.parse(value);
    if (normalizeDiagnosticMessageId(snapshot.message_id) !== id)
      throw new Error('Diagnostics received for a different message');
    return snapshot;
  };
  const load = () => {
    if (stopped || inFlight || socketLive) return;
    inFlight = true;
    const startedVersion = streamVersion;
    const controller = new AbortController();
    request = controller;
    Promise.race([
      fetchSnapshot(controller.signal),
      new Promise<never>((_resolve, reject) => {
        requestTimer = setTimeout(() => {
          controller.abort();
          reject(new Error('Diagnostics request timed out'));
        }, 15_000);
      }),
    ])
      .then((value) => {
        // An HTTP request started before a newer socket update cannot retract that update.
        if (stopped || streamVersion !== startedVersion) return;
        onSnapshot(read(value));
        onError(undefined);
      })
      .catch((error: unknown) => {
        if (!stopped && streamVersion === startedVersion) {
          logger.warn('Could not load message diagnostics', error);
          onError(error instanceof Error ? error.message : 'Diagnostics unavailable');
        }
      })
      .finally(() => {
        clearTimeout(requestTimer);
        request = undefined;
        inFlight = false;
      });
  };
  const reconnect = () => {
    if (stopped || reconnectTimer) return;
    const previous = socket;
    socket = undefined;
    socketLive = false;
    previous?.close();
    clearTimeout(initialTimer);
    clearTimeout(heartbeatTimer);
    onConnection('disconnected');
    load();
    reconnectTimer = setTimeout(() => {
      reconnectTimer = undefined;
      connect();
    }, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, 10_000);
  };
  const watchHeartbeat = () => {
    clearTimeout(heartbeatTimer);
    heartbeatTimer = setTimeout(reconnect, 65_000);
  };
  const connect = () => {
    if (stopped || !wsUrl) return;
    onConnection('connecting');
    let current: WebSocket;
    try {
      const url = new URL(wsUrl);
      url.searchParams.set('diagnostics', 'true');
      url.searchParams.set('messageIds', messageId);
      current = new WebSocket(url);
    } catch (error) {
      logger.warn('Could not create message diagnostics websocket', error);
      reconnect();
      return;
    }
    socket = current;
    watchHeartbeat();
    initialTimer = setTimeout(reconnect, 10_000);
    current.onmessage = ({ data }) => {
      if (socket !== current || stopped) return;
      try {
        const frame = frameSchema.parse(JSON.parse(data));
        watchHeartbeat();
        if (frame.type === 'diagnostics') {
          const snapshot = read(frame.data);
          streamVersion++;
          socketLive = true;
          reconnectDelay = 1_000;
          clearTimeout(initialTimer);
          onSnapshot(snapshot);
          onConnection('live');
          onError(undefined);
        } else if (
          frame.type === 'diagnostics_unavailable' &&
          (!frame.message_ids ||
            frame.message_ids.some((value) => normalizeDiagnosticMessageId(value) === id))
        ) {
          socketLive = false;
          clearTimeout(initialTimer);
          onConnection('disconnected');
          load();
        } else if (frame.type === 'error') reconnect();
      } catch (error) {
        logger.warn('Could not read message diagnostics websocket', error);
        reconnect();
      }
    };
    current.onerror = current.onclose = () => {
      if (socket === current) reconnect();
    };
  };
  onConnection(live ? 'connecting' : 'historical');
  if (live && wsUrl) connect();
  else {
    load();
    if (live) onConnection('disconnected');
  }
  const fallback = live ? setInterval(load, 10_000) : undefined;
  return () => {
    stopped = true;
    clearTimeout(reconnectTimer);
    clearTimeout(initialTimer);
    clearTimeout(heartbeatTimer);
    clearInterval(fallback);
    clearTimeout(requestTimer);
    request?.abort();
    socket?.close();
  };
}

export function useMessageDiagnostics(
  messageId: string,
  live: boolean,
  enabled = true,
): MessageDiagnosticsResult {
  const client = useClient();
  const [current, setCurrent] = useState<{ messageId: string; result: MessageDiagnosticsResult }>();
  useEffect(() => {
    if (!enabled) return;
    const update = (change: Partial<MessageDiagnosticsResult>) =>
      setCurrent((previous) => ({
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
    return connectMessageDiagnostics({
      messageId,
      live,
      wsUrl: config.wsUrl,
      fetchSnapshot: async (signal) => {
        const response = await client
          .query<{ message_diagnostics: unknown }>(
            DIAGNOSTICS_QUERY,
            { messageId },
            { requestPolicy: 'network-only', fetchOptions: { signal } },
          )
          .toPromise();
        if (response.error) throw response.error;
        return response.data?.message_diagnostics;
      },
      onConnection: (connectionState) => update({ connectionState }),
      onError: (error) => update({ error, fetching: false }),
      onSnapshot: (diagnostics) =>
        setCurrent((previous) => {
          const before = previous?.messageId === messageId ? previous.result : undefined;
          const retained: DiagnosticObservations | undefined = before
            ? { partial: before.diagnostics?.partial ?? false, relayers: before.relayers }
            : undefined;
          const next = reconcileDiagnosticObservations(
            retained,
            reduceMessageDiagnostics(diagnostics),
          );
          return {
            messageId,
            result: {
              diagnostics: { ...diagnostics, partial: next.partial },
              relayers: next.relayers,
              connectionState: before?.connectionState ?? (live ? 'connecting' : 'historical'),
              fetching: false,
            },
          };
        }),
    });
  }, [client, enabled, live, messageId]);
  const result = current?.messageId === messageId ? current.result : undefined;
  return {
    diagnostics: result?.diagnostics ?? null,
    relayers: result?.relayers ?? [],
    connectionState: enabled
      ? (result?.connectionState ?? (live ? 'connecting' : 'historical'))
      : 'historical',
    fetching: enabled && (result?.fetching ?? true),
    error: result?.error,
  };
}

export function useMessageActivityPage(messageId: string, refreshKey?: string, enabled = true) {
  const [pagination, setPagination] = useState<{
    messageId: string;
    page: number;
    cursors: Array<string | null>;
  }>({ messageId, page: 0, cursors: [null] });
  const [history, setHistory] = useState<{ messageId: string; rows: DiagnosticActivity[] }>({
    messageId,
    rows: [],
  });
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const previousRefresh = useRef({ messageId, refreshKey });
  const current =
    pagination.messageId === messageId ? pagination : { messageId, page: 0, cursors: [null] };
  const beforeId = current.cursors[current.page] ?? null;
  const [{ data, fetching, error, operation }, refresh] = useQuery<{ message_activity: unknown }>({
    query: ACTIVITY_QUERY,
    variables: { messageId, beforeId, limit: HISTORY_PAGE_SIZE },
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
    if (!activityPage) return;
    setHistory((previous) => ({
      messageId,
      rows: mergeActivityHistory(
        previous.messageId === messageId ? previous.rows : [],
        activityPage.activities,
      ),
    }));
  }, [activityPage, messageId]);
  useEffect(() => {
    setPagination({ messageId, page: 0, cursors: [null] });
  }, [messageId]);
  useEffect(() => {
    return () => {
      clearTimeout(refreshTimer.current);
      refreshTimer.current = undefined;
    };
  }, [enabled, messageId]);
  useEffect(() => {
    const changed =
      previousRefresh.current.messageId === messageId &&
      previousRefresh.current.refreshKey !== refreshKey;
    previousRefresh.current = { messageId, refreshKey };
    if (!changed || !enabled || current.page !== 0 || !refreshKey || refreshTimer.current) return;
    refreshTimer.current = setTimeout(() => {
      refreshTimer.current = undefined;
      refresh({ requestPolicy: 'network-only' });
    }, 1_000);
  }, [current.page, enabled, messageId, refresh, refreshKey]);
  useEffect(() => {
    if (current.page === 0) return;
    clearTimeout(refreshTimer.current);
    refreshTimer.current = undefined;
  }, [current.page]);
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
  return {
    activityPage,
    loadedActivities: history.messageId === messageId ? history.rows : [],
    page: current.page,
    fetching: enabled && fetching,
    error: error?.message ?? activityResult.error,
    next,
    previous,
    latest,
  };
}
