import { TEST_RECIPIENT_ADDRESS } from '../../../consts/addresses';
import { Message, MessageStatus, MessageStub, PartialTransactionReceipt } from '../../../types';
import { areAddressesEqual, ensureLeading0x } from '../../../utils/addresses';
import { logger } from '../../../utils/logger';
import { tryUtf8DecodeBytes } from '../../../utils/string';

import {
  MessageEntry,
  MessageStubEntry,
  MessagesQueryResult,
  MessagesStubQueryResult,
  TransactionEntry,
} from './fragments';

/**
 * ========================
 * RESULT PARSING UTILITIES
 * For parsing raw results
 * ========================
 */

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
    const destinationTimestamp = m.delivered_message?.transaction
      ? parseTimestampString(m.delivered_message.transaction.block.timestamp)
      : undefined;
    return {
      id: m.id.toString(),
      msgId: m.msg_id,
      status,
      sender: parsePaddedAddress(m.sender),
      recipient: parsePaddedAddress(m.recipient),
      originDomainId: m.origin,
      destinationDomainId: m.destination,
      originChainId: m.origin,
      destinationChainId: m.destination,
      originTimestamp: parseTimestampString(m.timestamp),
      destinationTimestamp,
    };
  } catch (error) {
    logger.error('Error parsing message stub', error);
    return null;
  }
}

function parseMessage(m: MessageEntry): Message | null {
  try {
    const stub = parseMessageStub(m);
    if (!stub) throw new Error('Message stub required');

    const destinationTransaction = m.delivered_message?.transaction
      ? parseTransaction(m.delivered_message.transaction)
      : undefined;

    const body = decodePostgresBinaryHex(m.msg_body ?? '');
    const isTestRecipient = areAddressesEqual(stub.recipient, TEST_RECIPIENT_ADDRESS);
    const decodedBody = isTestRecipient ? tryUtf8DecodeBytes(body) : undefined;

    return {
      ...stub,
      nonce: m.nonce,
      body,
      decodedBody,
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
function decodePostgresBinaryHex(b: string) {
  const buffer = Buffer.from(b.substring(2), 'hex');
  return ensureLeading0x(buffer.toString('hex'));
}

function getMessageStatus(m: MessageEntry | MessageStubEntry) {
  const { delivered_message, message_states } = m;
  if (delivered_message) {
    return MessageStatus.Delivered;
  } else if (message_states.length > 0) {
    const latestState = message_states.at(-1);
    if (latestState && !latestState.processable) {
      return MessageStatus.Failing;
    }
  }
  return MessageStatus.Pending;
}
