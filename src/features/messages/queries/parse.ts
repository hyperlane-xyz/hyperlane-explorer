import { MultiProvider } from '@hyperlane-xyz/sdk';

import { Message, MessageStatus, MessageStub } from '../../../types';
import { logger } from '../../../utils/logger';
import { tryUtf8DecodeBytes } from '../../../utils/string';
import { DomainsEntry } from '../../chains/queries/fragments';
import { isPiChain } from '../../chains/utils';

import { postgresByteaToAddress, postgresByteaToString } from './encoding';
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

export function parseMessageStubResult(
  multiProvider: MultiProvider,
  scrapedChains: DomainsEntry[],
  data: MessagesStubQueryResult | undefined,
): MessageStub[] {
  if (!data || !Object.keys(data).length) return [];
  return Object.values(data)
    .flat()
    .map((m) => parseMessageStub(multiProvider, scrapedChains, m))
    .filter((m): m is MessageStub => !!m)
    .sort((a, b) => b.origin.timestamp - a.origin.timestamp);
}

export function parseMessageQueryResult(
  multiProvider: MultiProvider,
  scrapedChains: DomainsEntry[],
  data: MessagesQueryResult | undefined,
): Message[] {
  if (!data || !Object.keys(data).length) return [];
  return Object.values(data)
    .flat()
    .map((m) => parseMessage(multiProvider, scrapedChains, m))
    .filter((m): m is Message => !!m)
    .sort((a, b) => b.origin.timestamp - a.origin.timestamp);
}

function parseMessageStub(
  multiProvider: MultiProvider,
  scrapedChains: DomainsEntry[],
  m: MessageStubEntry,
): MessageStub | null {
  try {
    const originMetadata = multiProvider.tryGetChainMetadata(m.origin_domain_id);
    const destinationMetadata = multiProvider.tryGetChainMetadata(m.destination_domain_id);
    let destinationChainId = m.destination_chain_id || destinationMetadata?.chainId;
    if (!destinationChainId) {
      logger.debug(
        `No chainId known for domain ${m.destination_domain_id}. Using domain as chainId`,
      );
      destinationChainId = m.destination_domain_id;
    }
    const isPiMsg =
      isPiChain(multiProvider, scrapedChains, m.origin_chain_id) ||
      isPiChain(multiProvider, scrapedChains, destinationChainId);

    return {
      status: getMessageStatus(m),
      id: m.id.toString(),
      msgId: postgresByteaToString(m.msg_id),
      nonce: m.nonce,
      sender: postgresByteaToAddress(m.sender, originMetadata),
      recipient: postgresByteaToAddress(m.recipient, destinationMetadata),
      originChainId: m.origin_chain_id,
      originDomainId: m.origin_domain_id,
      destinationChainId,
      destinationDomainId: m.destination_domain_id,
      origin: {
        timestamp: parseTimestampString(m.send_occurred_at),
        hash: postgresByteaToString(m.origin_tx_hash),
        from: postgresByteaToAddress(m.origin_tx_sender, originMetadata),
      },
      destination: m.is_delivered
        ? {
            timestamp: parseTimestampString(m.delivery_occurred_at!),
            hash: postgresByteaToString(m.destination_tx_hash!),
            from: postgresByteaToAddress(m.destination_tx_sender!, destinationMetadata),
          }
        : undefined,
      isPiMsg,
    };
  } catch (error) {
    logger.error('Error parsing message stub', error);
    return null;
  }
}

function parseMessage(
  multiProvider: MultiProvider,
  scrapedChains: DomainsEntry[],
  m: MessageEntry,
): Message | null {
  try {
    const stub = parseMessageStub(multiProvider, scrapedChains, m);
    if (!stub) throw new Error('Message stub required');

    const originMetadata = multiProvider.tryGetChainMetadata(m.origin_domain_id);
    const destinationMetadata = multiProvider.tryGetChainMetadata(m.destination_domain_id);

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
        mailbox: postgresByteaToAddress(m.origin_mailbox, originMetadata),
        nonce: m.origin_tx_nonce,
        to: postgresByteaToAddress(m.origin_tx_recipient, originMetadata),
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
            mailbox: postgresByteaToAddress(m.destination_mailbox!, destinationMetadata),
            nonce: m.destination_tx_nonce!,
            to: postgresByteaToAddress(m.destination_tx_recipient!, destinationMetadata),
            gasLimit: m.destination_tx_gas_limit!,
            gasPrice: m.destination_tx_gas_price!,
            effectiveGasPrice: m.destination_tx_effective_gas_price!,
            gasUsed: m.destination_tx_gas_used!,
            cumulativeGasUsed: m.destination_tx_cumulative_gas_used!,
            maxFeePerGas: m.destination_tx_max_fee_per_gas!,
            maxPriorityPerGas: m.destination_tx_max_priority_fee_per_gas!,
          }
        : undefined,
      totalGasAmount: m.total_gas_amount.toString(),
      totalPayment: m.total_payment.toString(),
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
