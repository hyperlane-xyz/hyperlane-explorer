import { useContext, useEffect, useEffectEvent, useState } from 'react';

import type { MessageStub, MessageTxStub } from '../../../types';
import { ExplorerEventsContext, ExplorerMessageRowsContext } from './ExplorerEventsProvider';
import type { MessageEntry } from './fragments';

export type { ExplorerConnectionState } from './ExplorerEventsProvider';

export function useExplorerEvents() {
  const context = useContext(ExplorerEventsContext);
  if (!context) throw new Error('ExplorerEventsProvider is required');
  return context;
}

export function useExplorerMessageRows() {
  return useContext(ExplorerMessageRowsContext);
}

export function isExplorerMessageCovered(
  domainIds: number[],
  message?: Pick<MessageStub, 'originDomainId' | 'destinationDomainId'>,
) {
  return (
    !domainIds.length ||
    (!!message &&
      (domainIds.includes(message.originDomainId >>> 0) ||
        domainIds.includes(message.destinationDomainId >>> 0)))
  );
}

export function useIsMessageLive(message: MessageStub) {
  const { connectionState, domainIds } = useExplorerEvents();
  return connectionState === 'connected' && isExplorerMessageCovered(domainIds, message);
}

export function useExplorerRefresh(enabled: boolean, refresh: () => void, domains?: number[]) {
  const { subscribeRefresh } = useExplorerEvents();
  const onRefresh = useEffectEvent((domain?: number) => {
    if (domain === undefined || !domains?.length || domains.some((id) => id >>> 0 === domain))
      refresh();
  });
  useEffect(() => {
    if (!enabled) return;
    return subscribeRefresh((domain) => onRefresh(domain));
  }, [enabled, subscribeRefresh]);
}

export function filterLatestMessageRows(messageRows: MessageEntry[], domains: number[]) {
  return messageRows.filter(
    (row) =>
      domains.length === 0 ||
      (domains.includes(row.origin_domain_id) && domains.includes(row.destination_domain_id)),
  );
}

export function useMessageRowSubscription(
  messageId: string,
  enabled: boolean,
  refresh: () => void,
  message?: MessageStub,
) {
  const { connectionState, domainIds, subscribe } = useExplorerEvents();
  const origin = message?.originDomainId;
  const destination = message?.destinationDomainId;
  useExplorerRefresh(
    enabled,
    refresh,
    origin === undefined || destination === undefined ? undefined : [origin, destination],
  );
  const [live, setLive] = useState<{ messageId: string; row: MessageEntry | null }>();
  useEffect(() => {
    if (!enabled) return;
    return subscribe(
      messageId,
      (row) => setLive({ messageId, row }),
      origin === undefined || destination === undefined ? [] : [origin, destination],
    );
  }, [enabled, messageId, subscribe, origin, destination]);

  const row = live?.messageId === messageId ? live.row : null;
  const coveredMessage = row
    ? { originDomainId: row.origin_domain_id, destinationDomainId: row.destination_domain_id }
    : message;
  const connected =
    enabled &&
    connectionState === 'connected' &&
    isExplorerMessageCovered(domainIds, coveredMessage);
  return {
    connected,
    messageRow: connected ? row : null,
  };
}

/** Retain enrichment across partial updates, never the message's delivery state. */
export function useRetainedMessage<M extends MessageStub>(message: M | null): M | null {
  const [snapshot, setSnapshot] = useState({ input: message, retained: message });
  if (snapshot.input === message) return snapshot.retained;

  const retained = preserveMessageTransactionFields(message, snapshot.retained);
  setSnapshot({ input: message, retained });
  return retained;
}

export function preserveMessageTransactionFields<M extends MessageStub>(
  current: M | null,
  previous: M | null,
): M | null {
  if (!current || !previous || current.msgId.toLowerCase() !== previous.msgId.toLowerCase()) {
    return current;
  }

  const origin =
    current.originDomainId === previous.originDomainId &&
    current.originChainId === previous.originChainId
      ? preserveTransactionFields(current.origin, previous.origin)
      : current.origin;
  // An absent destination is authoritative (e.g. delivery rollback).
  const destination =
    current.destination &&
    previous.destination &&
    current.destinationDomainId === previous.destinationDomainId &&
    current.destinationChainId === previous.destinationChainId
      ? preserveTransactionFields(current.destination, previous.destination)
      : current.destination;

  return origin === current.origin && destination === current.destination
    ? current
    : { ...current, origin, destination };
}

function preserveTransactionFields<T extends MessageTxStub>(current: T, previous: T): T {
  if (
    current.hash !== previous.hash ||
    (current.blockNumber != null &&
      previous.blockNumber != null &&
      String(current.blockNumber) !== String(previous.blockNumber)) ||
    ('blockHash' in current &&
      'blockHash' in previous &&
      current.blockHash != null &&
      previous.blockHash != null &&
      current.blockHash !== previous.blockHash)
  ) {
    return current;
  }

  let result = current;
  for (const key in previous) {
    if (current[key] == null && previous[key] != null) {
      if (result === current) result = { ...current };
      result[key] = previous[key];
    }
  }
  return result;
}
