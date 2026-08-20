import {
  PropsWithChildren,
  createContext,
  createElement,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { config } from '../../../consts/config';
import { logger } from '../../../utils/logger';
import type { MessageEntry } from './fragments';

const INITIAL_RECONNECT_DELAY_MS = 1_000;
const MAX_RECONNECT_DELAY_MS = 10_000;
const HEARTBEAT_TIMEOUT_MS = 65_000;
const MAX_RETAINED_MESSAGES = 500;

type MessageUpsert = { data: MessageEntry; type: 'message_upsert' };

export type ExplorerConnectionState = 'connecting' | 'connected' | 'disconnected' | 'unavailable';

interface ExplorerEventsContextValue {
  connectionState: ExplorerConnectionState;
  messageRows: MessageEntry[];
}

const ExplorerEventsContext = createContext<ExplorerEventsContextValue | null>(null);

export function ExplorerEventsProvider({ children }: PropsWithChildren) {
  const [connectionState, setConnectionState] = useState<ExplorerConnectionState>(
    config.wsUrl ? 'connecting' : 'unavailable',
  );
  const [messageRows, setMessageRows] = useState<MessageEntry[]>([]);

  useEffect(() => {
    if (!config.wsUrl) return;

    let closed = false;
    let heartbeatTimer: ReturnType<typeof setTimeout> | undefined;
    let reconnectDelayMs = INITIAL_RECONNECT_DELAY_MS;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let ws: WebSocket | undefined;

    const scheduleReconnect = () => {
      if (closed || reconnectTimer) return;
      setConnectionState('disconnected');
      setMessageRows([]);
      reconnectTimer = setTimeout(() => {
        reconnectTimer = undefined;
        connect();
      }, reconnectDelayMs);
      reconnectDelayMs = Math.min(reconnectDelayMs * 2, MAX_RECONNECT_DELAY_MS);
    };

    const watchHeartbeat = (socket: WebSocket) => {
      if (heartbeatTimer) clearTimeout(heartbeatTimer);
      heartbeatTimer = setTimeout(() => {
        if (document.visibilityState === 'hidden') {
          watchHeartbeat(socket);
          return;
        }
        if (ws !== socket) return;
        socket.close();
        scheduleReconnect();
      }, HEARTBEAT_TIMEOUT_MS);
    };

    const connect = () => {
      if (closed || !config.wsUrl) return;

      const socket = new WebSocket(config.wsUrl);
      ws = socket;
      watchHeartbeat(socket);
      socket.onopen = () => watchHeartbeat(socket);
      socket.onmessage = ({ data }) => {
        if (ws !== socket) return;
        watchHeartbeat(socket);
        const message = parseMessage(data);
        if (message?.type === 'ready') {
          reconnectDelayMs = INITIAL_RECONNECT_DELAY_MS;
          setConnectionState('connected');
        } else if (message?.type === 'message_upsert') {
          setMessageRows((rows) =>
            [message.data, ...rows.filter((row) => row.msg_id !== message.data.msg_id)].slice(
              0,
              MAX_RETAINED_MESSAGES,
            ),
          );
        }
      };
      socket.onerror = () => {
        if (ws !== socket) return;
        logger.warn('Explorer live message websocket error');
        socket.close();
        scheduleReconnect();
      };
      socket.onclose = () => {
        if (closed || ws !== socket) return;
        if (heartbeatTimer) clearTimeout(heartbeatTimer);
        scheduleReconnect();
      };
    };

    connect();
    return () => {
      closed = true;
      if (heartbeatTimer) clearTimeout(heartbeatTimer);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, []);

  const value = useMemo(() => ({ connectionState, messageRows }), [connectionState, messageRows]);

  return createElement(ExplorerEventsContext.Provider, { value }, children);
}

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
  const { connectionState, messageRows } = useExplorerEventsContext();
  useRefreshAfterReconnect(enabled, connectionState, refresh);
  const messageRow = enabled
    ? messageRows.find((row) => normalizeId(row.msg_id) === normalizeId(messageId)) || null
    : null;

  return { connected: enabled && connectionState === 'connected', messageRow };
}

function useRefreshAfterReconnect(
  enabled: boolean,
  connectionState: ExplorerConnectionState,
  refresh: () => void,
) {
  const refreshRef = useRef(refresh);
  const previousConnectionState = useRef(connectionState);
  refreshRef.current = refresh;

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
  return (
    enabled && previousConnectionState === 'disconnected' && connectionState === 'connected'
  );
}

function useExplorerEventsContext() {
  const context = useContext(ExplorerEventsContext);
  if (!context) throw new Error('ExplorerEventsProvider is required');
  return context;
}

function parseMessage(data: unknown): MessageUpsert | { type: 'heartbeat' | 'ready' } | null {
  if (typeof data !== 'string') return null;
  try {
    const message = JSON.parse(data) as { type?: unknown };
    if (message.type === 'ready' || message.type === 'heartbeat') return { type: message.type };
    if (message.type === 'message_upsert') return message as MessageUpsert;
    return null;
  } catch {
    return null;
  }
}

function normalizeId(value: unknown) {
  return typeof value === 'string' ? value.replace(/^(?:0x|\\x)/, '').toLowerCase() : null;
}
