import {
  PropsWithChildren,
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';

import { LIVE_MESSAGE_LIMIT } from '../../../consts/api';
import { config } from '../../../consts/config';
import { logger } from '../../../utils/logger';
import type { MessageEntry } from './fragments';

const INITIAL_RECONNECT_DELAY_MS = 1_000;
const MAX_RECONNECT_DELAY_MS = 10_000;
const HEARTBEAT_TIMEOUT_MS = 65_000;
const EMPTY_DOMAINS: number[] = [];

type MessageUpsert = {
  confirmations?: number;
  data: MessageEntry;
  type: 'message_upsert';
};
export type Rollback = {
  confirmations: number;
  domain: number;
  fromHeight: string;
  toHeight: string;
  type: 'rollback';
};
export type ExplorerBlock = {
  type: 'block';
  domain: number;
  height: string;
  hash: string;
  headHeight: string;
};
type RefreshListener = (domain?: number) => void;
type MessageListener = (message: MessageEntry | null) => void;
type MessageSubscription = {
  messageId: string;
  listener: MessageListener;
  row: MessageEntry | null;
  domains: number[];
};

export type ExplorerConnectionState = 'connecting' | 'connected' | 'disconnected' | 'unavailable';

export interface ExplorerEventsContextValue {
  connectionState: ExplorerConnectionState;
  subscribeRefresh: (listener: RefreshListener) => () => void;
  domainIds: number[];
  subscribe: (messageId: string, listener: MessageListener, domains?: number[]) => () => void;
}

export const ExplorerMessageRowsContext = createContext<MessageEntry[]>([]);
export const ExplorerEventsContext = createContext<ExplorerEventsContextValue | null>(null);
export function createExplorerBlockHeads() {
  const heads = new Map<number, ExplorerBlock>();
  const listeners = new Map<number, Set<() => void>>();
  return {
    get: (domain: number) => heads.get(domain),
    set(block: ExplorerBlock) {
      heads.set(block.domain, block);
      listeners.get(block.domain)?.forEach((listener) => listener());
    },
    clear() {
      heads.clear();
      listeners.forEach((subscribers) => subscribers.forEach((listener) => listener()));
    },
    subscribe(domain: number, listener: () => void) {
      const subscribers = listeners.get(domain) ?? new Set();
      subscribers.add(listener);
      listeners.set(domain, subscribers);
      return () => {
        subscribers.delete(listener);
        if (!subscribers.size) listeners.delete(domain);
      };
    },
  };
}

export const ExplorerBlockHeadsContext = createContext(createExplorerBlockHeads());

export function useExplorerBlockValue<T>(
  domain: number | undefined,
  select: (head: ExplorerBlock | undefined) => T,
) {
  const heads = useContext(ExplorerBlockHeadsContext);
  const subscribe = useCallback(
    (listener: () => void) => (domain === undefined ? () => {} : heads.subscribe(domain, listener)),
    [domain, heads],
  );
  return useSyncExternalStore(
    subscribe,
    () => select(domain === undefined ? undefined : heads.get(domain)),
    () => select(undefined),
  );
}

export function shouldEnableExplorerEvents(pathName: string) {
  return (
    pathName === '/' || pathName === '/message/[messageId]' || pathName.startsWith('/message/')
  );
}

export function ExplorerEventsProvider({
  children,
  domains = EMPTY_DOMAINS,
  enabled = true,
  blocks = false,
}: PropsWithChildren<{ domains?: number[]; enabled?: boolean; blocks?: boolean }>) {
  const [connectionState, setConnectionState] = useState<ExplorerConnectionState>('unavailable');
  const [messageRows, setMessageRows] = useState<MessageEntry[]>([]);
  const [blockHeads] = useState(createExplorerBlockHeads);
  const { domainIds, invalidDomainIds } = useMemo(
    () => partitionExplorerDomains(domains),
    [domains],
  );
  const domainKey = domainIds.join(',');
  const listenersRef = useRef(new Set<MessageSubscription>());
  const messageRowsRef = useRef<MessageEntry[]>([]);
  const refreshListenersRef = useRef(new Set<RefreshListener>());
  const subscribeRefresh = useCallback((listener: RefreshListener) => {
    refreshListenersRef.current.add(listener);
    return () => {
      refreshListenersRef.current.delete(listener);
    };
  }, []);

  const subscribe = useCallback(
    (messageId: string, listener: MessageListener, domains: number[] = []) => {
      const subscription: MessageSubscription = {
        messageId: normalizeId(messageId),
        listener,
        domains: domains.map((domain) => domain >>> 0),
        row:
          messageRowsRef.current.find(
            (row) => normalizeId(row.msg_id) === normalizeId(messageId),
          ) ?? null,
      };
      listenersRef.current.add(subscription);
      listener(subscription.row);
      return () => {
        listenersRef.current.delete(subscription);
      };
    },
    [],
  );

  const clearMessages = useCallback(() => {
    messageRowsRef.current = [];
    setMessageRows([]);
    listenersRef.current.forEach((subscription) => {
      subscription.row = null;
      subscription.listener(null);
    });
  }, []);

  useEffect(() => {
    if (invalidDomainIds.length) {
      logger.error('Ignoring invalid Explorer websocket domains', invalidDomainIds);
    }
  }, [invalidDomainIds]);

  useEffect(() => {
    clearMessages();
    blockHeads.clear();
    if (!enabled || !config.wsUrl) {
      setConnectionState('unavailable');
      return;
    }
    setConnectionState('connecting');
    const subscribedDomains = domainKey ? domainKey.split(',').map(Number) : [];
    let customDomains = new Set<number>();
    let closed = false;
    let heartbeatTimer: ReturnType<typeof setTimeout> | undefined;
    let reconnectDelayMs = INITIAL_RECONNECT_DELAY_MS;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let ws: WebSocket | undefined;

    const scheduleReconnect = () => {
      if (closed || reconnectTimer) return;
      ws = undefined;
      if (heartbeatTimer) clearTimeout(heartbeatTimer);
      setConnectionState('disconnected');
      blockHeads.clear();
      clearMessages();
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
        socket = new WebSocket(withConfirmations(config.wsUrl, subscribedDomains, blocks));
      } catch (error) {
        logger.error('Could not create Explorer live message websocket', error);
        scheduleReconnect();
        return;
      }
      ws = socket;
      watchHeartbeat(socket);
      socket.onopen = () => {
        if (ws === socket) watchHeartbeat(socket);
      };
      socket.onmessage = ({ data }) => {
        if (ws !== socket) return;
        watchHeartbeat(socket);
        const message = parseExplorerEvent(data);
        if (message?.type === 'ready') {
          customDomains = new Set(message.customDomains);
          reconnectDelayMs = INITIAL_RECONNECT_DELAY_MS;
          setConnectionState('connected');
          refreshListenersRef.current.forEach((listener) => listener());
        } else if (message?.type === 'block') {
          blockHeads.set(message);
        } else if (message?.type === 'message_upsert') {
          const messageRow = {
            ...message.data,
            is_provisional:
              message.data.is_provisional ??
              (message.confirmations === 0 &&
                (customDomains.has(message.data.origin_domain_id) ||
                  customDomains.has(message.data.destination_domain_id))),
            live_confirmations: customDomains.has(message.data.origin_domain_id)
              ? message.confirmations
              : undefined,
            live_received_at: Date.now(),
          };
          listenersRef.current.forEach((subscription) => {
            if (normalizeId(messageRow.msg_id) !== subscription.messageId) return;
            subscription.row = messageRow;
            subscription.domains = [messageRow.origin_domain_id, messageRow.destination_domain_id];
            subscription.listener(messageRow);
          });
          const nextRows = [
            messageRow,
            ...messageRowsRef.current.filter((row) => row.msg_id !== messageRow.msg_id),
          ].slice(0, LIVE_MESSAGE_LIMIT);
          messageRowsRef.current = nextRows;
          setMessageRows(nextRows);
        } else if (message?.type === 'rollback') {
          let changed = false;
          const nextRows = messageRowsRef.current.flatMap((row) => {
            const next = applyExplorerRollback(row, message);
            changed ||= next !== row;
            return next ? [next] : [];
          });
          listenersRef.current.forEach((subscription) => {
            if (subscription.domains.includes(message.domain)) changed = true;
            const next = subscription.row && applyExplorerRollback(subscription.row, message);
            if (next === subscription.row) return;
            subscription.row = next;
            subscription.listener(next);
            changed = true;
          });
          if (changed) {
            messageRowsRef.current = nextRows;
            setMessageRows(nextRows);
            refreshListenersRef.current.forEach((listener) => listener(message.domain));
          }
        }
      };
      socket.onerror = () => {
        if (ws !== socket) return;
        logger.warn('Explorer live message websocket error');
        socket.close();
        scheduleReconnect();
      };
      socket.onclose = (event) => {
        if (closed || ws !== socket) return;
        if (event.code === 1008) {
          logger.warn('Explorer websocket subscription rejected', event.reason);
          ws = undefined;
          if (heartbeatTimer) clearTimeout(heartbeatTimer);
          setConnectionState('unavailable');
          blockHeads.clear();
          clearMessages();
          return;
        }
        scheduleReconnect();
      };
    };

    connect();
    return () => {
      closed = true;
      if (heartbeatTimer) clearTimeout(heartbeatTimer);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
      ws = undefined;
    };
  }, [domainKey, enabled, clearMessages, blockHeads, blocks]);

  const value = useMemo(
    () => ({
      connectionState,
      subscribeRefresh,
      subscribe,
      domainIds: domainKey ? domainKey.split(',').map(Number) : [],
    }),
    [connectionState, subscribeRefresh, subscribe, domainKey],
  );

  return createElement(
    ExplorerEventsContext.Provider,
    { value },
    createElement(
      ExplorerMessageRowsContext.Provider,
      { value: messageRows },
      createElement(ExplorerBlockHeadsContext.Provider, { value: blockHeads }, children),
    ),
  );
}

export function parseExplorerEvent(
  data: unknown,
):
  | MessageUpsert
  | Rollback
  | ExplorerBlock
  | { type: 'heartbeat' }
  | { type: 'ready'; customDomains: number[] }
  | null {
  if (typeof data !== 'string') return null;
  try {
    const message = JSON.parse(data) as Record<string, unknown>;
    if (message.type === 'heartbeat') return { type: 'heartbeat' };
    if (message.type === 'ready') {
      if (
        message.customDomains !== undefined &&
        (!Array.isArray(message.customDomains) || !message.customDomains.every(isDomain))
      )
        throw new Error('Invalid Explorer custom domains');
      return { type: 'ready', customDomains: (message.customDomains as number[]) ?? [] };
    }
    if (message.type === 'block') {
      if (
        typeof message.domain !== 'number' ||
        !Number.isInteger(message.domain) ||
        message.domain < 0 ||
        message.domain > 0xffffffff ||
        !isHeight(message.height) ||
        !isHeight(message.headHeight) ||
        !Number.isSafeInteger(Number(message.headHeight)) ||
        BigInt(message.headHeight) < BigInt(message.height) ||
        typeof message.hash !== 'string' ||
        !/^0x[\da-fA-F]{64}$/.test(message.hash)
      ) {
        logger.warn('Ignoring invalid Explorer block payload');
        return null;
      }
      return {
        type: 'block',
        domain: message.domain,
        height: message.height,
        hash: message.hash,
        headHeight: message.headHeight,
      };
    }
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
      type: 'message_upsert',
    };
  } catch (error) {
    logger.warn('Ignoring invalid Explorer live message event', error);
    return null;
  }
}

function isMessageUpsertEnvelope(
  value: Record<string, unknown>,
): value is Record<string, unknown> & Pick<MessageUpsert, 'confirmations'> {
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

export function withConfirmations(wsUrl: string, domains: number[], blocks = false) {
  const url = new URL(wsUrl);
  url.searchParams.set('blocks', String(blocks));
  if (domains.length) {
    url.searchParams.set('confirmations', '0');
    url.searchParams.set('domains', domains.join(','));
  }
  return url.toString();
}

export function partitionExplorerDomains(domains: number[]) {
  const valid = (domain: number) =>
    Number.isInteger(domain) && domain >= -0x80000000 && domain <= 0xffffffff;
  return {
    domainIds: [...new Set(domains.filter(valid).map((domain) => domain >>> 0))].sort(
      (a, b) => a - b,
    ),
    invalidDomainIds: [...new Set(domains.filter((domain) => !valid(domain)))],
  };
}

function isDomain(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
}

export function applyExplorerRollback(row: MessageEntry, rollback: Rollback): MessageEntry | null {
  const above = (height: number | string | null | undefined) =>
    height == null || BigInt(height) > BigInt(rollback.toHeight);
  if (row.origin_domain_id === rollback.domain && above(row.origin_block_height)) return null;
  if (
    row.destination_domain_id !== rollback.domain ||
    !row.is_delivered ||
    !above(row.destination_block_height)
  )
    return row;
  return {
    ...row,
    is_delivered: false,
    delivery_occurred_at: null,
    delivery_latency: null,
    ...Object.fromEntries(
      Object.keys(row)
        .filter((key) => /^destination_(tx_|block_|mailbox$)/.test(key))
        .map((key) => [key, null]),
    ),
  };
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
    typeof value.origin_block_hash === 'string' &&
    typeof value.origin_mailbox === 'string' &&
    (typeof value.origin_block_height === 'number' || isHeight(value.origin_block_height)) &&
    Number.isSafeInteger(Number(value.origin_block_height)) &&
    Number(value.origin_block_height) >= 0 &&
    isNumeric(value.total_gas_amount) &&
    isNumeric(value.total_payment) &&
    isNumeric(value.num_payments) &&
    (typeof value.id === 'string' || typeof value.id === 'number') &&
    typeof value.nonce === 'number' &&
    typeof value.origin_domain_id === 'number' &&
    typeof value.destination_domain_id === 'number' &&
    typeof value.is_delivered === 'boolean' &&
    !Number.isNaN(Date.parse(value.send_occurred_at))
  );
}

function isNumeric(value: unknown) {
  return (
    (typeof value === 'number' && Number.isFinite(value)) ||
    (typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

function normalizeId(value: string) {
  return value.replace(/^(?:0x|\\x)/, '').toLowerCase();
}
