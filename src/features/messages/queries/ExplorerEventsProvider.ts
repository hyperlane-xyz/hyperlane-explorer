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

type MessageUpsert = { data: MessageEntry; type: 'message_upsert' };
type MessageListener = (message: MessageEntry) => void;

export type ExplorerConnectionState = 'connecting' | 'connected' | 'disconnected' | 'unavailable';

export interface ExplorerEventsContextValue {
  connectionState: ExplorerConnectionState;
  messageRows: MessageEntry[];
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
  enabled = true,
}: PropsWithChildren<{ enabled?: boolean }>) {
  const [connectionState, setConnectionState] = useState<ExplorerConnectionState>('unavailable');
  const [messageRows, setMessageRows] = useState<MessageEntry[]>([]);
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
    if (!enabled || !config.wsUrl) {
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
        socket = new WebSocket(config.wsUrl);
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
  }, [enabled]);

  const value = useMemo(
    () => ({ connectionState, messageRows, subscribe }),
    [connectionState, messageRows, subscribe],
  );

  return createElement(ExplorerEventsContext.Provider, { value }, children);
}

export function parseExplorerEvent(
  data: unknown,
): MessageUpsert | { type: 'heartbeat' | 'ready' } | null {
  if (typeof data !== 'string') return null;
  try {
    const message = JSON.parse(data) as { data?: unknown; type?: unknown };
    if (message.type === 'ready' || message.type === 'heartbeat') return { type: message.type };
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

function isMessageEntry(value: unknown): value is MessageEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Record<string, unknown>;
  const stringFields = [
    'msg_id',
    'sender',
    'recipient',
    'send_occurred_at',
    'origin_tx_hash',
    'origin_tx_sender',
    'origin_tx_recipient',
    'origin_block_hash',
    'origin_mailbox',
    'destination_mailbox',
    'destination_tx_recipient',
  ];
  const numberFields = [
    'id',
    'nonce',
    'origin_chain_id',
    'origin_domain_id',
    'origin_tx_id',
    'destination_chain_id',
    'destination_domain_id',
    'origin_block_height',
    'origin_block_id',
    'origin_tx_cumulative_gas_used',
    'origin_tx_effective_gas_price',
    'origin_tx_gas_limit',
    'origin_tx_gas_price',
    'origin_tx_gas_used',
    'origin_tx_max_fee_per_gas',
    'origin_tx_max_priority_fee_per_gas',
    'origin_tx_nonce',
    'total_gas_amount',
    'total_payment',
    'num_payments',
  ];
  const nullableStringFields = [
    'message_body',
    'delivery_occurred_at',
    'delivery_latency',
    'destination_tx_hash',
    'destination_tx_sender',
    'destination_block_hash',
  ];
  const nullableNumberFields = [
    'destination_tx_id',
    'destination_block_height',
    'destination_block_id',
    'destination_tx_cumulative_gas_used',
    'destination_tx_effective_gas_price',
    'destination_tx_gas_limit',
    'destination_tx_gas_price',
    'destination_tx_gas_used',
    'destination_tx_max_fee_per_gas',
    'destination_tx_max_priority_fee_per_gas',
    'destination_tx_nonce',
  ];
  return (
    stringFields.every((field) => typeof entry[field] === 'string') &&
    numberFields.every((field) => typeof entry[field] === 'number') &&
    nullableStringFields.every(
      (field) => entry[field] === null || typeof entry[field] === 'string',
    ) &&
    nullableNumberFields.every(
      (field) => entry[field] === null || typeof entry[field] === 'number',
    ) &&
    typeof entry.is_delivered === 'boolean' &&
    !Number.isNaN(Date.parse(entry.send_occurred_at as string)) &&
    (!entry.is_delivered ||
      (typeof entry.delivery_occurred_at === 'string' &&
        typeof entry.destination_tx_hash === 'string' &&
        typeof entry.destination_tx_sender === 'string' &&
        typeof entry.destination_tx_recipient === 'string' &&
        typeof entry.destination_block_hash === 'string' &&
        typeof entry.destination_block_height === 'number' &&
        typeof entry.destination_tx_nonce === 'number'))
  );
}

function normalizeId(value: unknown) {
  return typeof value === 'string' ? value.replace(/^(?:0x|\\x)/, '').toLowerCase() : null;
}
