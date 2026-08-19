import { useEffect, useRef, useState } from 'react';

import { config } from '../../../consts/config';
import { logger } from '../../../utils/logger';

const INITIAL_RECONNECT_DELAY_MS = 1_000;
const MAX_RECONNECT_DELAY_MS = 10_000;
const HEARTBEAT_TIMEOUT_MS = 65_000;
const REFRESH_DELAYS_MS = [1_000, 5_000, 15_000];

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
    const refreshTimers = new Map<number, ReturnType<typeof setTimeout>>();
    let ws: WebSocket | undefined;

    const scheduleReconnect = () => {
      if (closed || reconnectTimer) return;
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
          socket.send(JSON.stringify({ streams, type: 'subscribe' }));
        } else if (message?.type === 'subscribed') {
          reconnectDelayMs = INITIAL_RECONNECT_DELAY_MS;
          setConnected(true);
        } else if (
          message?.type === 'event' &&
          (!messageId || normalizeId(message.data?.msg_id) === normalizeId(messageId))
        ) {
          REFRESH_DELAYS_MS.forEach((delay) => {
            if (refreshTimers.has(delay)) return;
            refreshTimers.set(
              delay,
              setTimeout(() => {
                refreshTimers.delete(delay);
                refreshRef.current();
              }, delay),
            );
          });
        } else if (message?.type === 'error') {
          setConnected(false);
          socket.close();
          scheduleReconnect();
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
      refreshTimers.forEach(clearTimeout);
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
