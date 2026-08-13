import { useEffect, useState } from 'react';

import { config } from '../../../consts/config';
import { logger } from '../../../utils/logger';
import { MessageEntry, MessageStubEntry } from './fragments';

const INITIAL_RECONNECT_DELAY_MS = 1_000;
const MAX_RECONNECT_DELAY_MS = 10_000;

type LatestMessage = {
  message: MessageStubEntry | null;
  msg_id: string;
  operation?: 'INSERT' | 'UPDATE' | null;
  type: 'latest_message';
};

type MessageUpdate = {
  message: MessageEntry | null;
  msg_id: string;
  operation?: 'INSERT' | 'UPDATE' | null;
  type: 'message' | 'message_snapshot';
};

type LiveMessage = LatestMessage | MessageUpdate;

export function useLatestMessageRows(enabled: boolean) {
  const [messageRows, setMessageRows] = useState<MessageStubEntry[]>([]);

  useEffect(() => {
    if (!enabled || !config.wsUrl) return;

    return connectLiveMessages({
      onMessage: (message) => {
        if (!message.message || message.type !== 'latest_message') return;
        setMessageRows((rows) => upsertMessageRow(rows, message.message!));
      },
      onSubscribe: (ws) => {
        ws.send(JSON.stringify({ type: 'subscribe_latest' }));
      },
      warnMessage: 'Explorer live message websocket error',
    });
  }, [enabled]);

  return messageRows;
}

export function useMessageRowSubscription(messageId: string, enabled: boolean) {
  const [messageRow, setMessageRow] = useState<MessageEntry | null>(null);

  useEffect(() => {
    if (!enabled || !config.wsUrl || !messageId) return;

    return connectLiveMessages({
      onMessage: (message) => {
        if (
          !message.message ||
          (message.type !== 'message' && message.type !== 'message_snapshot')
        ) {
          return;
        }
        setMessageRow(message.message);
      },
      onSubscribe: (ws) => {
        ws.send(
          JSON.stringify({
            msg_id: messageId,
            type: 'subscribe_message',
          }),
        );
      },
      warnMessage: 'Explorer message websocket error',
    });
  }, [enabled, messageId]);

  return messageRow;
}

function connectLiveMessages({
  onMessage,
  onSubscribe,
  warnMessage,
}: {
  onMessage: (message: LiveMessage) => void;
  onSubscribe: (ws: WebSocket) => void;
  warnMessage: string;
}) {
  let closed = false;
  let reconnectDelayMs = INITIAL_RECONNECT_DELAY_MS;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let ws: WebSocket | undefined;

  const connect = () => {
    if (closed || !config.wsUrl) return;

    ws = new WebSocket(config.wsUrl);
    ws.onopen = () => {
      reconnectDelayMs = INITIAL_RECONNECT_DELAY_MS;
      onSubscribe(ws!);
    };
    ws.onmessage = (event) => {
      const message = parseLiveMessage(event.data);
      if (message) onMessage(message);
    };
    ws.onerror = () => {
      logger.warn(warnMessage);
    };
    ws.onclose = () => {
      if (closed) return;
      reconnectTimer = setTimeout(connect, reconnectDelayMs);
      reconnectDelayMs = Math.min(reconnectDelayMs * 2, MAX_RECONNECT_DELAY_MS);
    };
  };

  connect();

  return () => {
    closed = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    ws?.close();
  };
}

function parseLiveMessage(data: string): LiveMessage | null {
  try {
    const parsed = JSON.parse(data) as { type?: unknown };
    if (
      parsed.type === 'latest_message' ||
      parsed.type === 'message' ||
      parsed.type === 'message_snapshot'
    ) {
      return parsed as LiveMessage;
    }
    return null;
  } catch {
    return null;
  }
}

function upsertMessageRow(rows: MessageStubEntry[], message: MessageStubEntry): MessageStubEntry[] {
  const nextRows = rows.filter((row) => row.id !== message.id);
  nextRows.unshift(message);
  return nextRows;
}
