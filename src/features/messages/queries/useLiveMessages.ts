import { useEffect, useRef, useState } from 'react';

import { config } from '../../../consts/config';
import { logger } from '../../../utils/logger';

const INITIAL_RECONNECT_DELAY_MS = 1_000;
const MAX_RECONNECT_DELAY_MS = 10_000;
const HEARTBEAT_TIMEOUT_MS = 65_000;
const REFRESH_DELAY_MS = 1_000;

export type LiveStream = {
  domains?: number[];
  eventType: 'delivery' | 'dispatch';
};

export function useLiveMessageRefresh(
  enabled: boolean,
  streams: LiveStream[],
  refresh: () => void,
  messageId?: string,
) {
  const [connected, setConnected] = useState(false);
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    if (!enabled || !config.wsUrl) return;
    setConnected(false);

    let closed = false;
    let heartbeatTimer: ReturnType<typeof setTimeout> | undefined;
    let reconnectDelayMs = INITIAL_RECONNECT_DELAY_MS;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    let ws: WebSocket | undefined;

    const watchHeartbeat = () => {
      if (heartbeatTimer) clearTimeout(heartbeatTimer);
      heartbeatTimer = setTimeout(() => {
        if (document.visibilityState === 'hidden') {
          watchHeartbeat();
          return;
        }
        setConnected(false);
        ws?.close();
      }, HEARTBEAT_TIMEOUT_MS);
    };

    const connect = () => {
      if (closed || !config.wsUrl) return;

      ws = new WebSocket(config.wsUrl);
      ws.onopen = watchHeartbeat;
      ws.onmessage = ({ data }) => {
        watchHeartbeat();
        const message = parseMessage(data);
        if (message?.type === 'ready') {
          reconnectDelayMs = INITIAL_RECONNECT_DELAY_MS;
          ws?.send(JSON.stringify({ streams, type: 'subscribe' }));
        } else if (message?.type === 'subscribed') {
          setConnected(true);
        } else if (
          message?.type === 'event' &&
          (!messageId || normalizeId(message.data?.msg_id) === normalizeId(messageId))
        ) {
          refreshTimer ??= setTimeout(() => {
            refreshTimer = undefined;
            refreshRef.current();
          }, REFRESH_DELAY_MS);
        }
      };
      ws.onerror = () => {
        setConnected(false);
        logger.warn('Explorer live message websocket error');
      };
      ws.onclose = () => {
        if (closed) return;
        if (heartbeatTimer) clearTimeout(heartbeatTimer);
        setConnected(false);
        reconnectTimer = setTimeout(connect, reconnectDelayMs);
        reconnectDelayMs = Math.min(reconnectDelayMs * 2, MAX_RECONNECT_DELAY_MS);
      };
    };

    connect();
    return () => {
      closed = true;
      if (heartbeatTimer) clearTimeout(heartbeatTimer);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (refreshTimer) clearTimeout(refreshTimer);
      ws?.close();
    };
  }, [enabled, messageId, streams]);

  return enabled && connected;
}

function parseMessage(data: unknown) {
  if (typeof data !== 'string') return null;
  try {
    return JSON.parse(data) as { data?: { msg_id?: unknown }; type?: unknown };
  } catch {
    return null;
  }
}

function normalizeId(value: unknown) {
  return typeof value === 'string' ? value.replace(/^(?:0x|\\x)/, '').toLowerCase() : null;
}
