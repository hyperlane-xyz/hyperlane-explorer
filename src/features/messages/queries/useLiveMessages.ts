import { useEffect, useRef, useState } from 'react';

import { config } from '../../../consts/config';
import { logger } from '../../../utils/logger';
import type { MessageEntry, MessageStubEntry } from './fragments';

const INITIAL_RECONNECT_DELAY_MS = 1_000;
const MAX_RECONNECT_DELAY_MS = 10_000;
const HEARTBEAT_TIMEOUT_MS = 65_000;

type MessageUpsert = {
  data: MessageEntry;
  type: 'message_upsert';
};

export function useLatestMessageRows(
  enabled: boolean,
  domains: number[],
  limit: number,
  refresh: () => void,
) {
  const [messageRows, setMessageRows] = useState<MessageStubEntry[]>([]);
  const connected = useExplorerEvents(enabled, refresh, ({ data }) => {
    if (!domains.includes(data.origin_domain_id) || !domains.includes(data.destination_domain_id)) {
      return;
    }
    setMessageRows((rows) =>
      [data, ...rows.filter((row) => row.msg_id !== data.msg_id)]
        .sort((a, b) => b.send_occurred_at.localeCompare(a.send_occurred_at))
        .slice(0, limit),
    );
  });

  useEffect(() => {
    if (!enabled) setMessageRows([]);
  }, [enabled]);

  return { connected, messageRows };
}

export function useMessageRowSubscription(
  messageId: string,
  enabled: boolean,
  refresh: () => void,
) {
  const [messageRow, setMessageRow] = useState<MessageEntry | null>(null);
  const connected = useExplorerEvents(enabled, refresh, (event) => {
    if (normalizeId(event.data.msg_id) === normalizeId(messageId)) setMessageRow(event.data);
  });

  return {
    connected,
    messageRow: normalizeId(messageRow?.msg_id) === normalizeId(messageId) ? messageRow : null,
  };
}

function useExplorerEvents(
  enabled: boolean,
  refresh: () => void,
  onEvent: (event: MessageUpsert) => void,
) {
  const [connected, setConnected] = useState(false);
  const refreshRef = useRef(refresh);
  const eventRef = useRef(onEvent);
  refreshRef.current = refresh;
  eventRef.current = onEvent;

  useEffect(() => {
    if (!enabled || !config.wsUrl) return;
    setConnected(false);

    let closed = false;
    let reconnect = false;
    let heartbeatTimer: ReturnType<typeof setTimeout> | undefined;
    let reconnectDelayMs = INITIAL_RECONNECT_DELAY_MS;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let ws: WebSocket | undefined;

    const scheduleReconnect = () => {
      if (closed || reconnectTimer) return;
      reconnect = true;
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
        setConnected(false);
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
          if (reconnect) refreshRef.current();
          reconnect = false;
          setConnected(true);
        } else if (message?.type === 'message_upsert') {
          eventRef.current(message);
        }
      };
      socket.onerror = () => {
        if (ws !== socket) return;
        setConnected(false);
        logger.warn('Explorer live message websocket error');
        socket.close();
        scheduleReconnect();
      };
      socket.onclose = () => {
        if (closed || ws !== socket) return;
        if (heartbeatTimer) clearTimeout(heartbeatTimer);
        setConnected(false);
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
  }, [enabled]);

  return enabled && connected;
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
