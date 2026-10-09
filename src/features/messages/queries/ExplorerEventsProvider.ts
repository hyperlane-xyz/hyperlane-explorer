import {
  PropsWithChildren,
  createContext,
  createElement,
  useCallback,
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
const EMPTY_DOMAINS: number[] = [];

type MessageUpsert = { data: MessageEntry; type: 'message_upsert' };
type Rollback = {
  confirmations: number;
  domain: number;
  fromHeight: string;
  toHeight: string;
  type: 'rollback';
};
type MessageListener = (message: MessageEntry | null) => void;

export type ExplorerConnectionState = 'connecting' | 'connected' | 'disconnected' | 'unavailable';

export interface ExplorerEventsContextValue {
  connectionState: ExplorerConnectionState;
  messageRows: MessageEntry[];
  rollbackVersion: number;
  subscribe: (messageId: string, listener: MessageListener) => () => void;
}

export const ExplorerEventsContext = createContext<ExplorerEventsContextValue | null>(null);

export function shouldEnableExplorerEvents(pathName: string) {
  return (
    pathName === '/' || pathName === '/message/[messageId]' || pathName.startsWith('/message/')
  );
}

export function ExplorerEventsProvider({
  children,
  domains = EMPTY_DOMAINS,
  enabled = true,
}: PropsWithChildren<{ domains?: number[]; enabled?: boolean }>) {
  const [connectionState, setConnectionState] = useState<ExplorerConnectionState>('unavailable');
  const [messageRows, setMessageRows] = useState<MessageEntry[]>([]);
  const [rollbackVersion, setRollbackVersion] = useState(0);
  const domainIds = useMemo(() => [...new Set(domains)].sort((a, b) => a - b), [domains]);
  const listenersRef = useRef<Map<string, Set<MessageListener>>>(new Map());

  const subscribe = useCallback((messageId: string, listener: MessageListener) => {
    const normalizedId = normalizeId(messageId);
    if (!normalizedId) return () => undefined;

    const listeners = listenersRef.current.get(normalizedId) ?? new Set();
    listeners.add(listener);
    listenersRef.current.set(normalizedId, listeners);
    return () => {
      listeners.delete(listener);
      if (!listeners.size) listenersRef.current.delete(normalizedId);
    };
  }, []);

  useEffect(() => {
    if (!enabled || !config.wsUrl || !domainIds.length) {
      setConnectionState('unavailable');
      setMessageRows([]);
      return;
    }

    setConnectionState('connecting');
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

      let socket: WebSocket;
      try {
        socket = new WebSocket(withConfirmations(config.wsUrl, domainIds));
      } catch (error) {
        logger.error('Could not create Explorer live message websocket', error);
        scheduleReconnect();
        return;
      }
      ws = socket;
      watchHeartbeat(socket);
      socket.onopen = () => watchHeartbeat(socket);
      socket.onmessage = ({ data }) => {
        if (ws !== socket) return;
        watchHeartbeat(socket);
        const message = parseExplorerEvent(data);
        if (message?.type === 'ready') {
          reconnectDelayMs = INITIAL_RECONNECT_DELAY_MS;
          setConnectionState('connected');
        } else if (message?.type === 'message_upsert') {
          const normalizedId = normalizeId(message.data.msg_id);
          if (normalizedId) {
            listenersRef.current.get(normalizedId)?.forEach((listener) => listener(message.data));
          }
          setMessageRows((rows) =>
            [message.data, ...rows.filter((row) => row.msg_id !== message.data.msg_id)].slice(
              0,
              MAX_RETAINED_MESSAGES,
            ),
          );
        } else if (message?.type === 'rollback') {
          // A message row combines origin, delivery, and payment state. One
          // chain rollback can therefore invalidate rows last updated by a
          // different chain, so discard the complete provisional overlay.
          listenersRef.current.forEach((listeners) =>
            listeners.forEach((listener) => listener(null)),
          );
          setMessageRows([]);
          setRollbackVersion((version) => version + 1);
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
  }, [domainIds, enabled]);

  const value = useMemo(
    () => ({ connectionState, messageRows, rollbackVersion, subscribe }),
    [connectionState, messageRows, rollbackVersion, subscribe],
  );

  return createElement(ExplorerEventsContext.Provider, { value }, children);
}

export function parseExplorerEvent(
  data: unknown,
): MessageUpsert | Rollback | { type: 'heartbeat' | 'ready' } | null {
  if (typeof data !== 'string') return null;
  try {
    const message = JSON.parse(data) as { data?: unknown; type?: unknown };
    if (message.type === 'ready' || message.type === 'heartbeat') return { type: message.type };
    if (message.type === 'rollback') {
      if (!isRollback(message)) {
        logger.warn('Ignoring invalid Explorer rollback payload');
        return null;
      }
      return message;
    }
    if (message.type !== 'message_upsert') return null;
    if (!isMessageEntry(message.data)) {
      logger.warn('Ignoring invalid Explorer live message payload');
      return null;
    }
    return { data: message.data, type: 'message_upsert' };
  } catch (error) {
    logger.warn('Ignoring invalid Explorer live message event', error);
    return null;
  }
}

export function withConfirmations(wsUrl: string, domains: number[]) {
  const url = new URL(wsUrl);
  url.searchParams.set('confirmations', '0');
  url.searchParams.set('domains', domains.join(','));
  return url.toString();
}

function isRollback(value: unknown): value is Rollback {
  if (!isRecord(value)) return false;
  const domain = value.domain;
  return (
    value.confirmations === 0 &&
    typeof domain === 'number' &&
    Number.isSafeInteger(domain) &&
    domain >= 0 &&
    isHeight(value.fromHeight) &&
    isHeight(value.toHeight) &&
    BigInt(value.toHeight) < BigInt(value.fromHeight)
  );
}

function isHeight(value: unknown): value is string {
  return typeof value === 'string' && /^(?:0|[1-9][0-9]*)$/.test(value);
}

function isMessageEntry(value: unknown): value is MessageEntry {
  if (!isRecord(value)) return false;
  return (
    typeof value.msg_id === 'string' &&
    typeof value.sender === 'string' &&
    typeof value.recipient === 'string' &&
    typeof value.send_occurred_at === 'string' &&
    typeof value.origin_tx_hash === 'string' &&
    (typeof value.id === 'string' || typeof value.id === 'number') &&
    typeof value.nonce === 'number' &&
    typeof value.origin_domain_id === 'number' &&
    typeof value.destination_domain_id === 'number' &&
    typeof value.is_delivered === 'boolean' &&
    !Number.isNaN(Date.parse(value.send_occurred_at))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

function normalizeId(value: unknown) {
  return typeof value === 'string' ? value.replace(/^(?:0x|\\x)/, '').toLowerCase() : null;
}
