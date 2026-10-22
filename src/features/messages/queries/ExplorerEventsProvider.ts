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
type MessageListener = (message: MessageEntry | null) => void;

export type ExplorerConnectionState = 'connecting' | 'connected' | 'disconnected' | 'unavailable';

export interface ExplorerEventsContextValue {
  connectionState: ExplorerConnectionState;
  messageRows: MessageEntry[];
  revision: number;
  subscribe: (messageId: string, listener: MessageListener) => () => void;
}

export const ExplorerEventsContext = createContext<ExplorerEventsContextValue | null>(null);
export function createExplorerBlockHeads(onWatchingChange = (_watching: boolean) => {}) {
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
      onWatchingChange(true);
      return () => {
        subscribers.delete(listener);
        if (!subscribers.size) listeners.delete(domain);
        onWatchingChange(listeners.size > 0);
      };
    },
  };
}

export const ExplorerBlockHeadsContext = createContext(createExplorerBlockHeads());

export function useExplorerBlockHead(domain?: number) {
  const heads = useContext(ExplorerBlockHeadsContext);
  const subscribe = useCallback(
    (listener: () => void) => (domain === undefined ? () => {} : heads.subscribe(domain, listener)),
    [domain, heads],
  );
  return useSyncExternalStore(
    subscribe,
    () => (domain === undefined ? undefined : heads.get(domain)),
    () => undefined,
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
  const [messageRows, setMessageRows] = useState<MessageEntry[]>([]);
  const [revision, setRevision] = useState(0);
  const [blocksEnabled, setBlocksEnabled] = useState(false);
  const [blockHeads] = useState(() => createExplorerBlockHeads(setBlocksEnabled));
  const { domainIds, invalidDomainIds } = useMemo(
    () => partitionExplorerDomains(domains),
    [domains],
  );
  const listenersRef = useRef(new Set<MessageListener>());
  const messageRowsRef = useRef<MessageEntry[]>([]);

  const subscribe = useCallback((messageId: string, listener: MessageListener) => {
    const normalizedId = normalizeId(messageId);
    const onMessage: MessageListener = (row) => {
      if (!row || normalizeId(row.msg_id) === normalizedId) listener(row);
    };
    listenersRef.current.add(onMessage);
    onMessage(
      messageRowsRef.current.find((row) => normalizeId(row.msg_id) === normalizedId) ?? null,
    );
    return () => {
      listenersRef.current.delete(onMessage);
    };
  }, []);

  const clearMessages = useCallback(() => {
    messageRowsRef.current = [];
    setMessageRows([]);
    listenersRef.current.forEach((listener) => listener(null));
  }, []);

  useEffect(() => {
    if (invalidDomainIds.length) {
      logger.error('Ignoring invalid Explorer websocket domains', invalidDomainIds);
    }
  }, [invalidDomainIds]);

  useEffect(() => {
    clearMessages();
    setConnectionState('connecting');
  }, [domainIds, enabled, clearMessages]);

  useEffect(() => {
    blockHeads.clear();
    if (!enabled || !config.wsUrl) {
      setConnectionState('unavailable');
      return;
    }

    // Changing block subscriptions must not discard the active message overlay.
    setConnectionState((state) => (state === 'connected' ? state : 'connecting'));
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
        socket = new WebSocket(withConfirmations(config.wsUrl, domainIds, blocksEnabled));
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
          reconnectDelayMs = INITIAL_RECONNECT_DELAY_MS;
          setConnectionState('connected');
          setRevision((version) => version + 1);
        } else if (message?.type === 'block') {
          blockHeads.set(message);
        } else if (message?.type === 'message_upsert') {
          const messageRow = {
            ...message.data,
            live_confirmations: message.confirmations,
            live_received_at: Date.now(),
          };
          listenersRef.current.forEach((listener) => listener(messageRow));
          const nextRows = [
            messageRow,
            ...messageRowsRef.current.filter((row) => row.msg_id !== messageRow.msg_id),
          ].slice(0, LIVE_MESSAGE_LIMIT);
          messageRowsRef.current = nextRows;
          setMessageRows(nextRows);
        } else if (message?.type === 'rollback') {
          // Affected messages may exist only in a snapshot or retained subscription.
          // Invalidate every consumer, even when the bounded overlay is empty.
          clearMessages();
          setRevision((version) => version + 1);
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
  }, [domainIds, enabled, clearMessages, blockHeads, blocksEnabled]);

  const value = useMemo(
    () => ({ connectionState, messageRows, revision, subscribe }),
    [connectionState, messageRows, revision, subscribe],
  );

  return createElement(
    ExplorerEventsContext.Provider,
    { value },
    createElement(ExplorerBlockHeadsContext.Provider, { value: blockHeads }, children),
  );
}

export function parseExplorerEvent(
  data: unknown,
): MessageUpsert | Rollback | ExplorerBlock | { type: 'heartbeat' | 'ready' } | null {
  if (typeof data !== 'string') return null;
  try {
    const message = JSON.parse(data) as Record<string, unknown>;
    if (message.type === 'ready' || message.type === 'heartbeat') return { type: message.type };
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

function normalizeId(value: unknown) {
  return typeof value === 'string' ? value.replace(/^(?:0x|\\x)/, '').toLowerCase() : null;
}
