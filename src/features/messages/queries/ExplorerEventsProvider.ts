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

type MessageUpsert = {
  confirmations?: number;
  data: MessageEntry;
  domain?: number;
  height?: string;
  type: 'message_upsert';
};
export type Rollback = {
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
  const { domainIds, invalidDomainIds } = useMemo(
    () => partitionExplorerDomains(domains),
    [domains],
  );
  const listenersRef = useRef<Map<string, Set<MessageListener>>>(new Map());
  const messageRowsRef = useRef<MessageEntry[]>([]);

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
    if (invalidDomainIds.length) {
      logger.error('Ignoring invalid Explorer websocket domains', invalidDomainIds);
    }
  }, [invalidDomainIds]);

  useEffect(() => {
    if (!enabled || !config.wsUrl) {
      setConnectionState('unavailable');
      messageRowsRef.current = [];
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
      messageRowsRef.current = [];
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
        socket = new WebSocket(
          domainIds.length ? withConfirmations(config.wsUrl, domainIds) : config.wsUrl,
        );
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
          const messageRow = {
            ...message.data,
            live_confirmations: message.confirmations,
            live_domain: message.domain,
            live_height: message.height,
          };
          const normalizedId = normalizeId(messageRow.msg_id);
          if (normalizedId) {
            listenersRef.current.get(normalizedId)?.forEach((listener) => listener(messageRow));
          }
          const nextRows = [
            messageRow,
            ...messageRowsRef.current.filter((row) => row.msg_id !== messageRow.msg_id),
          ].slice(0, MAX_RETAINED_MESSAGES);
          messageRowsRef.current = nextRows;
          setMessageRows(nextRows);
        } else if (message?.type === 'rollback') {
          const rows = messageRowsRef.current;
          const nextRows = reconcileMessageRowsAfterRollback(rows, message);
          if (nextRows === rows) return;
          const nextRowsById = new Map(
            nextRows.map((row) => [normalizeId(row.msg_id), row] as const),
          );
          rows.forEach((row) => {
            const normalizedId = normalizeId(row.msg_id);
            const nextRow = nextRowsById.get(normalizedId);
            if (!normalizedId || nextRow === row) return;
            listenersRef.current
              .get(normalizedId)
              ?.forEach((listener) => listener(nextRow ?? null));
          });
          messageRowsRef.current = nextRows;
          setMessageRows(nextRows);
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
    const message = JSON.parse(data) as Record<string, unknown>;
    if (message.type === 'ready' || message.type === 'heartbeat') return { type: message.type };
    if (message.type === 'rollback') {
      if (!isRollback(message)) {
        logger.warn('Ignoring invalid Explorer rollback payload');
        return null;
      }
      return message;
    }
    if (message.type !== 'message_upsert') return null;
    if (!isMessageEntry(message.data) || !isMessageUpsertEnvelope(message)) {
      logger.warn('Ignoring invalid Explorer live message payload');
      return null;
    }
    return {
      ...(message.confirmations === undefined ? {} : { confirmations: message.confirmations }),
      data: message.data,
      ...(message.domain === undefined ? {} : { domain: message.domain }),
      ...(message.height === undefined ? {} : { height: message.height }),
      type: 'message_upsert',
    };
  } catch (error) {
    logger.warn('Ignoring invalid Explorer live message event', error);
    return null;
  }
}

function isMessageUpsertEnvelope(value: Record<string, unknown>): value is Record<
  string,
  unknown
> & {
  confirmations?: number;
  domain?: number;
  height?: string;
} {
  return (
    (value.confirmations === undefined ||
      (typeof value.confirmations === 'number' &&
        Number.isSafeInteger(value.confirmations) &&
        value.confirmations >= 0)) &&
    (value.domain === undefined ||
      (typeof value.domain === 'number' &&
        Number.isSafeInteger(value.domain) &&
        value.domain >= 0)) &&
    (value.height === undefined || isHeight(value.height))
  );
}

export function withConfirmations(wsUrl: string, domains: number[]) {
  const url = new URL(wsUrl);
  url.searchParams.set('confirmations', '0');
  url.searchParams.set('domains', domains.join(','));
  return url.toString();
}

export function partitionExplorerDomains(domains: number[]) {
  const uniqueDomains = [...new Set(domains)];
  return {
    domainIds: uniqueDomains
      .filter((domain) => Number.isSafeInteger(domain) && domain >= 0 && domain <= 0x7fffffff)
      .sort((a, b) => a - b),
    invalidDomainIds: uniqueDomains.filter(
      (domain) => !Number.isSafeInteger(domain) || domain < 0 || domain > 0x7fffffff,
    ),
  };
}

export function reconcileMessageRowsAfterRollback(messageRows: MessageEntry[], rollback: Rollback) {
  const toHeight = BigInt(rollback.toHeight);
  let changed = false;
  const nextRows = messageRows.flatMap((row) => {
    if (
      row.origin_domain_id === rollback.domain &&
      isHeightAbove(row.origin_block_height, toHeight)
    ) {
      changed = true;
      return [];
    }
    if (
      row.destination_domain_id !== rollback.domain ||
      !isHeightAbove(row.destination_block_height, toHeight)
    ) {
      return [row];
    }
    changed = true;
    return [
      {
        ...row,
        delivery_occurred_at: null,
        destination_tx_hash: null,
        destination_tx_recipient: null,
        destination_tx_sender: null,
        is_delivered: false,
      },
    ];
  });
  return changed ? nextRows : messageRows;
}

function isHeightAbove(value: unknown, height: bigint) {
  return (
    (typeof value === 'number' && Number.isSafeInteger(value) && BigInt(value) > height) ||
    (typeof value === 'string' && isHeight(value) && BigInt(value) > height)
  );
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
