import { Message, MessageStatus, MessageStub } from '../../../types';
import { logger } from '../../../utils/logger';
import { tryUtf8DecodeBytes } from '../../../utils/string';

import { postgresByteaToString } from './encoding';
import {
  MessageEntry,
  MessageStubEntry,
  MessagesQueryResult,
  MessagesStubQueryResult,
} from './fragments';

/**
 * ========================
 * RESULT PARSING UTILITIES
 * For parsing raw results
 * ========================
 */

export function parseMessageStubResult(data: MessagesStubQueryResult | undefined): MessageStub[] {
  if (!data?.message_view?.length) return [];
  return data.message_view.map(parseMessageStub).filter((m): m is MessageStub => !!m);
}

export function parseMessageQueryResult(data: MessagesQueryResult | undefined): Message[] {
  if (!data?.message_view?.length) return [];
  return data.message_view.map(parseMessage).filter((m): m is Message => !!m);
}

function parseMessageStub(m: MessageStubEntry): MessageStub | null {
  try {
    return {
      status: getMessageStatus(m),
      id: m.id.toString(),
      msgId: postgresByteaToString(m.msg_id),
      nonce: m.nonce,
      sender: postgresByteaToString(m.sender),
      recipient: postgresByteaToString(m.recipient),
      originChainId: m.origin_chain_id,
      originDomainId: m.origin_domain_id,
      destinationChainId: m.destination_chain_id,
      destinationDomainId: m.destination_domain_id,
      origin: {
        timestamp: parseTimestampString(m.send_occurred_at),
        hash: postgresByteaToString(m.origin_tx_hash),
        from: postgresByteaToString(m.origin_tx_sender),
      },
      destination: m.is_delivered
        ? {
            timestamp: parseTimestampString(m.delivery_occurred_at!),
            hash: postgresByteaToString(m.destination_tx_hash!),
            from: postgresByteaToString(m.destination_tx_sender!),
          }
        : undefined,
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

    const body = postgresByteaToString(m.message_body ?? '');
    const decodedBody = tryUtf8DecodeBytes(body);

    return {
      ...stub,
      body,
      decodedBody,
      origin: {
        ...stub.origin,
        blockHash: postgresByteaToString(m.origin_block_hash),
        blockNumber: m.origin_block_height,
        mailbox: postgresByteaToString(m.origin_mailbox),
        nonce: m.origin_tx_nonce,
        to: postgresByteaToString(m.origin_tx_recipient),
        gasLimit: m.origin_tx_gas_limit,
        gasPrice: m.origin_tx_gas_price,
        effectiveGasPrice: m.origin_tx_effective_gas_price,
        gasUsed: m.origin_tx_gas_used,
        cumulativeGasUsed: m.origin_tx_cumulative_gas_used,
        maxFeePerGas: m.origin_tx_max_fee_per_gas,
        maxPriorityPerGas: m.origin_tx_max_priority_fee_per_gas,
      },
      destination: stub.destination
        ? {
            ...stub.destination,
            blockHash: postgresByteaToString(m.destination_block_hash!),
            blockNumber: m.destination_block_height!,
            mailbox: postgresByteaToString(m.destination_mailbox!),
            nonce: m.destination_tx_nonce!,
            to: postgresByteaToString(m.destination_tx_recipient!),
            gasLimit: m.destination_tx_gas_limit!,
            gasPrice: m.destination_tx_gas_price!,
            effectiveGasPrice: m.destination_tx_effective_gas_price!,
            gasUsed: m.destination_tx_gas_used!,
            cumulativeGasUsed: m.destination_tx_cumulative_gas_used!,
            maxFeePerGas: m.destination_tx_max_fee_per_gas!,
            maxPriorityPerGas: m.destination_tx_max_priority_fee_per_gas!,
          }
        : undefined,
      totalGasAmount: m.total_gas_amount,
      totalPayment: m.total_payment,
      numPayments: m.num_payments,
    };
  } catch (error) {
    logger.error('Error parsing message', error);
    return null;
  }
}

function parseTimestampString(t: string) {
  const asUtc = t.at(-1) === 'Z' ? t : t + 'Z';
  return new Date(asUtc).getTime();
}

function getMessageStatus(m: MessageEntry | MessageStubEntry) {
  if (m.is_delivered) {
    return MessageStatus.Delivered;
  } else {
    // TODO consider gas and failure conditions here
    return MessageStatus.Pending;
  }
}
