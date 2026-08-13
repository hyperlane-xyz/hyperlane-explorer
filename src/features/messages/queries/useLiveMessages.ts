import { useEffect, useState } from 'react';

import { config } from '../../../consts/config';
import { logger } from '../../../utils/logger';
import { MessageEntry, MessageStubEntry } from './fragments';

type LatestMessageUpdated = {
  message: MessageStubEntry | null;
  msg_id: string;
  type: 'latest_message_updated';
};

type MessageUpdated = {
  message: MessageEntry | null;
  msg_id: string;
  type: 'message_updated' | 'message_snapshot';
};

type LiveMessage = LatestMessageUpdated | MessageUpdated;

export function useLatestMessageRows(enabled: boolean) {
  const [messageRows, setMessageRows] = useState<MessageStubEntry[]>([]);

  useEffect(() => {
    if (!enabled || !config.wsUrl) return;

    const ws = new WebSocket(config.wsUrl);
    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'subscribe_latest' }));
    };
    ws.onmessage = (event) => {
      const message = parseLiveMessage(event.data);
      if (!message?.message || message.type !== 'latest_message_updated') {
        return;
      }
      setMessageRows((rows) => upsertMessageRow(rows, message.message!));
    };
    ws.onerror = () => {
      logger.warn('Explorer live message websocket error');
    };

    return () => {
      ws.close();
    };
  }, [enabled]);

  return messageRows;
}

export function useMessageRowSubscription(messageId: string, enabled: boolean) {
  const [messageRow, setMessageRow] = useState<MessageEntry | null>(null);

  useEffect(() => {
    if (!enabled || !config.wsUrl || !messageId) return;

    const ws = new WebSocket(config.wsUrl);
    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          msg_id: messageId,
          type: 'subscribe_message',
        }),
      );
    };
    ws.onmessage = (event) => {
      const message = parseLiveMessage(event.data);
      if (
        !message?.message ||
        (message.type !== 'message_updated' && message.type !== 'message_snapshot')
      ) {
        return;
      }
      setMessageRow(message.message);
    };
    ws.onerror = () => {
      logger.warn('Explorer message websocket error');
    };

    return () => {
      ws.close();
    };
  }, [enabled, messageId]);

  return messageRow;
}

function parseLiveMessage(data: string): LiveMessage | null {
  try {
    const parsed = JSON.parse(data) as { type?: unknown };
    if (
      parsed.type === 'latest_message_updated' ||
      parsed.type === 'message_updated' ||
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
