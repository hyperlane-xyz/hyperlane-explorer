import { DomainToChain } from '../../consts/domains';
import {
  Message,
  MessageStatus,
  MessageStub,
  PartialTransactionReceipt,
} from '../../types';
import { logger } from '../../utils/logger';

import {
  MessageEntry,
  MessageStubEntry,
  MessagesQueryResult,
  MessagesStubQueryResult,
  TransactionEntry,
} from './types';

export function parseMessageStubResult(
  data: MessagesStubQueryResult | undefined,
): MessageStub[] {
  if (!data?.message?.length) return [];
  return data.message
    .map(parseMessageStub)
    .filter((m): m is MessageStub => !!m);
}

export function parseMessageQueryResult(
  data: MessagesQueryResult | undefined,
): Message[] {
  if (!data?.message?.length) return [];
  return data.message.map(parseMessage).filter((m): m is Message => !!m);
}

function parseMessageStub(m: MessageStubEntry): MessageStub | null {
  try {
    const status = getMessageStatus(m);
    return {
      id: m.id,
      status,
      sender: decodeBinaryHex(m.sender),
      recipient: decodeBinaryHex(m.recipient),
      originChainId: DomainToChain[m.origin],
      destinationChainId: DomainToChain[m.destination],
      timestamp: parseTimestampString(m.timestamp),
    };
  } catch (error) {
    logger.error('Error parsing message', error);
    return null;
  }
}

function parseMessage(m: MessageEntry): Message | null {
  try {
    const status = getMessageStatus(m);
    const destinationTransaction =
      status === MessageStatus.Delivered && m.delivered_message?.transaction
        ? parseTransaction(m.delivered_message.transaction)
        : undefined;
    return {
      id: m.id,
      status,
      sender: decodeBinaryHex(m.sender),
      recipient: decodeBinaryHex(m.recipient),
      body: decodeBinaryHex(m.msg_body ?? ''),
      originChainId: DomainToChain[m.origin],
      destinationChainId: DomainToChain[m.destination],
      timestamp: parseTimestampString(m.timestamp),
      originTransaction: parseTransaction(m.transaction),
      destinationTransaction,
    };
  } catch (error) {
    logger.error('Error parsing message', error);
    return null;
  }
}

function parseTransaction(t: TransactionEntry): PartialTransactionReceipt {
  return {
    from: decodeBinaryHex(t.sender),
    transactionHash: decodeBinaryHex(t.hash),
    blockNumber: t.block.height,
    gasUsed: t.gas_used,
    timestamp: parseTimestampString(t.block.timestamp),
  };
}

function parseTimestampString(t: string) {
  return new Date(t).getTime();
}

// TODO remove when db uses text
function decodeBinaryHex(b: string) {
  return btoa(b);
}

function getMessageStatus(m: MessageEntry | MessageStubEntry) {
  const { delivered_message, message_states } = m;
  if (delivered_message) {
    return MessageStatus.Delivered;
  } else if (message_states.length > 0) {
    const latestState = message_states.at(-1);
    if (latestState && latestState.processable) {
      return MessageStatus.Failing;
    }
  }
  return MessageStatus.Pending;
}
