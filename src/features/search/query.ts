import { domainToChain } from '../../consts/domains';
import { Message, MessageStatus, MessageStub, PartialTransactionReceipt } from '../../types';
import { ensureLeading0x } from '../../utils/addresses';
import { logger } from '../../utils/logger';

import {
  MessageEntry,
  MessageStubEntry,
  MessagesQueryResult,
  MessagesStubQueryResult,
  TransactionEntry,
} from './types';

export function parseMessageStubResult(data: MessagesStubQueryResult | undefined): MessageStub[] {
  if (!data?.message?.length) return [];
  return data.message.map(parseMessageStub).filter((m): m is MessageStub => !!m);
}

export function parseMessageQueryResult(data: MessagesQueryResult | undefined): Message[] {
  if (!data?.message?.length) return [];
  return data.message.map(parseMessage).filter((m): m is Message => !!m);
}

function parseMessageStub(m: MessageStubEntry): MessageStub | null {
  try {
    const status = getMessageStatus(m);
    return {
      id: m.id,
      status,
      sender: parsePaddedAddress(m.sender),
      recipient: parsePaddedAddress(m.recipient),
      originChainId: domainToChain[m.origin],
      destinationChainId: domainToChain[m.destination],
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
      status === MessageStatus.Delivered && m.delivered_messages
        ? parseTransaction(m.delivered_messages[0].transaction)
        : undefined;
    return {
      id: m.id,
      status,
      sender: parsePaddedAddress(m.sender),
      recipient: parsePaddedAddress(m.recipient),
      leafIndex: m.leaf_index,
      body: decodeBinaryHex(m.msg_body ?? ''),
      originChainId: domainToChain[m.origin],
      destinationChainId: domainToChain[m.destination],
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
    from: ensureLeading0x(t.sender),
    transactionHash: ensureLeading0x(t.hash),
    blockNumber: t.block.height,
    gasUsed: t.gas_used,
    timestamp: parseTimestampString(t.block.timestamp),
  };
}

function parseTimestampString(t: string) {
  const asUtc = t.at(-1) === 'Z' ? t : t + 'Z';
  return new Date(asUtc).getTime();
}

function parsePaddedAddress(a: string) {
  if (!a || a.length < 40) return '';
  return ensureLeading0x(a.slice(-40));
}

// https://github.com/bendrucker/postgres-bytea/blob/master/decoder.js
function decodeBinaryHex(b: string) {
  const buffer = Buffer.from(b.substring(2), 'hex');
  return ensureLeading0x(buffer.toString('hex'));
}

function getMessageStatus(m: MessageEntry | MessageStubEntry) {
  const { delivered_messages, message_states } = m;
  if (delivered_messages?.length) {
    return MessageStatus.Delivered;
  } else if (message_states.length > 0) {
    const latestState = message_states.at(-1);
    if (latestState && latestState.processable) {
      return MessageStatus.Failing;
    }
  }
  return MessageStatus.Pending;
}
