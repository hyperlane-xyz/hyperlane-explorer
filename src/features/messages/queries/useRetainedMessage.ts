import { useState } from 'react';

import type { MessageStub, MessageTxStub } from '../../../types';

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
