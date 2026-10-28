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
} from 'react';
import { z } from 'zod';
import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';

import { LIVE_MESSAGE_LIMIT } from '../../../consts/api';
import { config } from '../../../consts/config';
import { logger } from '../../../utils/logger';
import type { MessageEntry } from './fragments';

const INITIAL_RECONNECT_DELAY_MS = 1_000;
const MAX_RECONNECT_DELAY_MS = 10_000;
const HEARTBEAT_TIMEOUT_MS = 65_000;
const EMPTY_DOMAINS: number[] = [];

const height = z.string().regex(/^(?:0|[1-9][0-9]*)$/);
const uint = z.number().int().nonnegative();
const domain = uint.max(0xffffffff);
const blockSchema = z
  .object({
    type: z.literal('block'),
    domain,
    height,
    hash: z.string().regex(/^0x[\da-fA-F]{64}$/),
    headHeight: height.refine((value) => Number.isSafeInteger(Number(value))),
  })
  .refine((block) => BigInt(block.headHeight) >= BigInt(block.height));
const rollbackSchema = z
  .object({
    type: z.literal('rollback'),
    confirmations: z.literal(0),
    domain,
    fromHeight: height,
    toHeight: height,
  })
  .refine((rollback) => BigInt(rollback.toHeight) < BigInt(rollback.fromHeight));
const eventSchema = z.discriminatedUnion('type', [
  blockSchema,
  rollbackSchema,
  z.object({ type: z.literal('heartbeat') }),
  z.object({ type: z.literal('error'), error: z.string() }),
  z.object({ type: z.literal('ready'), customDomains: z.array(domain).default([]) }),
  z.object({
    type: z.literal('message_upsert'),
    confirmations: uint.optional(),
    data: z.custom<MessageEntry>(isMessageEntry),
  }),
]);
export type Rollback = z.infer<typeof rollbackSchema>;
export type ExplorerBlock = z.infer<typeof blockSchema>;
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

export const ExplorerEventsContext = createContext<ExplorerEventsContextValue | null>(null);
export function createExplorerStream() {
  return createStore(() => ({
    messageRows: [] as MessageEntry[],
    blockHeads: {} as Record<number, ExplorerBlock>,
  }));
}
export const ExplorerStreamContext = createContext(createExplorerStream());

export function useExplorerBlockValue<T>(
  domain: number | undefined,
  select: (head: ExplorerBlock | undefined) => T,
) {
  return useStore(useContext(ExplorerStreamContext), (state) =>
    select(domain === undefined ? undefined : state.blockHeads[domain]),
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
}: PropsWithChildren<{ domains?: number[]; enabled?: boolean }>) {
  const [connectionState, setConnectionState] = useState<ExplorerConnectionState>('unavailable');
  const [stream] = useState(createExplorerStream);
  const { domainIds, invalidDomainIds } = useMemo(
    () => partitionExplorerDomains(domains),
    [domains],
  );
  const domainKey = domainIds.join(',');
  const listenersRef = useRef(new Set<MessageSubscription>());
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
          stream
            .getState()
            .messageRows.find((row) => normalizeId(row.msg_id) === normalizeId(messageId)) ?? null,
      };
      listenersRef.current.add(subscription);
      listener(subscription.row);
      return () => {
        listenersRef.current.delete(subscription);
      };
    },
    [stream],
  );

  const clearMessages = useCallback(() => {
    stream.setState({ messageRows: [], blockHeads: {} });
    listenersRef.current.forEach((subscription) => {
      subscription.row = null;
      subscription.listener(null);
    });
  }, [stream]);

  useEffect(() => {
    if (invalidDomainIds.length) {
      logger.error('Ignoring invalid Explorer websocket domains', invalidDomainIds);
    }
  }, [invalidDomainIds]);

  useEffect(() => {
    clearMessages();
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
        socket = new WebSocket(withConfirmations(config.wsUrl, subscribedDomains));
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
        } else if (message?.type === 'error') {
          logger.warn('Explorer websocket subscription error', message.error);
        } else if (message?.type === 'block') {
          stream.setState((state) => ({
            blockHeads: { ...state.blockHeads, [message.domain]: message },
          }));
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
            ...stream.getState().messageRows.filter((row) => row.msg_id !== messageRow.msg_id),
          ].slice(0, LIVE_MESSAGE_LIMIT);
          stream.setState({ messageRows: nextRows });
        } else if (message?.type === 'rollback') {
          let changed = false;
          const nextRows = stream.getState().messageRows.flatMap((row) => {
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
            stream.setState({ messageRows: nextRows });
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
        if (event.code === 1008 && event.reason === 'Invalid subscription') {
          logger.warn('Explorer websocket subscription rejected', event.reason);
          ws = undefined;
          if (heartbeatTimer) clearTimeout(heartbeatTimer);
          setConnectionState('unavailable');
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
  }, [domainKey, enabled, clearMessages, stream]);

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
    createElement(ExplorerStreamContext.Provider, { value: stream }, children),
  );
}

export function parseExplorerEvent(data: unknown): z.infer<typeof eventSchema> | null {
  if (typeof data !== 'string') return null;
  try {
    return eventSchema.parse(JSON.parse(data));
  } catch (error) {
    logger.warn('Ignoring invalid Explorer live message event', error);
    return null;
  }
}

export function withConfirmations(wsUrl: string, domains: number[]) {
  const url = new URL(wsUrl);
  url.searchParams.set('blocks', 'true');
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

export function applyExplorerRollback(row: MessageEntry, rollback: Rollback): MessageEntry | null {
  const above = (height: number | string | null | undefined) =>
    height == null || BigInt(height) > BigInt(rollback.toHeight);
  if (row.origin_domain_id === rollback.domain && above(row.origin_block_height)) return null;
  if (
    row.destination_domain_id !== rollback.domain ||
    !row.is_delivered ||
    row.destination_block_height == null ||
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

function isHeight(value: unknown): value is string {
  return typeof value === 'string' && height.safeParse(value).success;
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
