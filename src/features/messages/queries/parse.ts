import { MultiProtocolProvider } from '@hyperlane-xyz/sdk';
import { Message, MessageStatus, MessageStub } from '../../../types';
import { logger } from '../../../utils/logger';
import { tryUtf8DecodeBytes } from '../../../utils/string';
import { DomainsEntry } from '../../chains/queries/fragments';
import { isPiChain } from '../../chains/utils';
import { postgresByteaToAddress, postgresByteaToString, postgresByteaToTxHash } from './encoding';
import {
  MessageEntry,
  MessagesQueryResult,
  MessagesStubQueryResult,
  MessageStubEntry,
  RawMessageDispatchEntry,
  RawMessagesQueryResult,
} from './fragments';
import { parseTimestampMillis } from './timestamp';

/**
 * ========================
 * RESULT PARSING UTILITIES
 * For parsing raw results
 * ========================
 */

export function parseMessageStubResult(
  multiProvider: MultiProtocolProvider,
  scrapedChains: DomainsEntry[],
  data: MessagesStubQueryResult | undefined,
): MessageStub[] {
  return queryResult(multiProvider, scrapedChains, data, parseMessageStub);
}

export function parseMessageQueryResult(
  multiProvider: MultiProtocolProvider,
  scrapedChains: DomainsEntry[],
  data: MessagesQueryResult | undefined,
): Message[] {
  return queryResult(multiProvider, scrapedChains, data, parseMessage);
}

export function parseRawMessageStubResult(
  multiProvider: MultiProtocolProvider,
  scrapedChains: DomainsEntry[],
  data: RawMessagesQueryResult | undefined,
): MessageStub[] {
  return queryResult(multiProvider, scrapedChains, data, parseRawMessageStub);
}

export function parseRawMessageQueryResult(
  multiProvider: MultiProtocolProvider,
  scrapedChains: DomainsEntry[],
  data: RawMessagesQueryResult | undefined,
): Message[] {
  return queryResult(multiProvider, scrapedChains, data, parseRawMessage);
}

export function mergeMessageStubs<M extends MessageStub>(messages: Array<M>): Array<M> {
  return deduplicateMessageList(messages).sort((a, b) => b.origin.timestamp - a.origin.timestamp);
}

function queryResult<D, M extends MessageStub>(
  multiProvider: MultiProtocolProvider,
  scrapedChains: DomainsEntry[],
  data: Record<string, D[]> | undefined,
  parseFn: (
    multiProvider: MultiProtocolProvider,
    scrapedChains: DomainsEntry[],
    data: D,
  ) => M | null,
) {
  if (!data || !Object.keys(data).length) return [];
  return mergeMessageStubs(
    Object.values(data)
      .flat()
      .map((d) => parseFn(multiProvider, scrapedChains, d))
      .filter((m): m is M => !!m),
  );
}

function parseMessageStub(
  multiProvider: MultiProtocolProvider,
  scrapedChains: DomainsEntry[],
  m: MessageStubEntry,
): MessageStub | null {
  try {
    const originMetadata = multiProvider.tryGetChainMetadata(m.origin_domain_id);
    const destinationMetadata = multiProvider.tryGetChainMetadata(m.destination_domain_id);
    const body = postgresByteaToString(m.message_body ?? '');

    const isPiMsg =
      isPiChain(multiProvider, scrapedChains, m.origin_domain_id) ||
      isPiChain(multiProvider, scrapedChains, m.destination_domain_id);

    return {
      status: getMessageStatus(m),
      id: m.id.toString(),
      msgId: postgresByteaToString(m.msg_id),
      nonce: m.nonce,
      sender: postgresByteaToAddress(m.sender, originMetadata),
      recipient: postgresByteaToAddress(m.recipient, destinationMetadata),
      originChainId: m.origin_chain_id,
      originDomainId: m.origin_domain_id,
      destinationChainId: m.destination_chain_id,
      destinationDomainId: m.destination_domain_id,
      body,
      origin: {
        timestamp: parseTimestampMillis(m.send_occurred_at),
        hash: postgresByteaToTxHash(m.origin_tx_hash, originMetadata),
        from: postgresByteaToAddress(m.origin_tx_sender, originMetadata),
        to: postgresByteaToAddress(m.origin_tx_recipient, originMetadata),
      },
      destination: m.is_delivered
        ? {
            timestamp: parseTimestampMillis(m.delivery_occurred_at!),
            hash: postgresByteaToTxHash(m.destination_tx_hash!, destinationMetadata),
            from: postgresByteaToAddress(m.destination_tx_sender!, destinationMetadata),
            to: postgresByteaToAddress(m.destination_tx_recipient!, destinationMetadata),
          }
        : undefined,
      isPiMsg,
      isProvisional: false,
    };
  } catch (error) {
    logger.error('Error parsing message stub', error);
    return null;
  }
}

function parseMessage(
  multiProvider: MultiProtocolProvider,
  scrapedChains: DomainsEntry[],
  m: MessageEntry,
): Message | null {
  try {
    const stub = parseMessageStub(multiProvider, scrapedChains, m);
    if (!stub) throw new Error('Message stub required');

    const originMetadata = multiProvider.tryGetChainMetadata(m.origin_domain_id);
    const destinationMetadata = multiProvider.tryGetChainMetadata(m.destination_domain_id);

    const decodedBody = tryUtf8DecodeBytes(stub.body);

    return {
      ...stub,
      decodedBody,
      origin: {
        ...stub.origin,
        blockHash: postgresByteaToString(m.origin_block_hash),
        blockNumber: m.origin_block_height,
        mailbox: postgresByteaToAddress(m.origin_mailbox, originMetadata),
        nonce: m.origin_tx_nonce,
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

function parseRawMessageStub(
  multiProvider: MultiProtocolProvider,
  scrapedChains: DomainsEntry[],
  m: RawMessageDispatchEntry,
): MessageStub | null {
  try {
    const originDomainId = m.origin_domain;
    const destinationDomainId = m.destination_domain;

    const originMetadata = multiProvider.tryGetChainMetadata(originDomainId);
    const destinationMetadata = multiProvider.tryGetChainMetadata(destinationDomainId);

    const isPiMsg =
      isPiChain(multiProvider, scrapedChains, originDomainId) ||
      isPiChain(multiProvider, scrapedChains, destinationDomainId);

    const sender = postgresByteaToAddress(m.sender, originMetadata);
    const originMailbox = postgresByteaToAddress(m.origin_mailbox, originMetadata);

    return {
      status: MessageStatus.Pending,
      id: `raw-${m.id}`,
      msgId: postgresByteaToString(m.msg_id),
      nonce: m.nonce,
      sender,
      recipient: postgresByteaToAddress(m.recipient, destinationMetadata),
      originChainId: chainIdForDomain(multiProvider, originDomainId),
      originDomainId,
      destinationChainId: chainIdForDomain(multiProvider, destinationDomainId),
      destinationDomainId,
      body: '',
      origin: {
        timestamp: parseTimestampMillis(m.time_updated ?? m.time_created),
        hash: postgresByteaToTxHash(m.origin_tx_hash, originMetadata),
        from: sender,
        to: originMailbox,
      },
      destination: undefined,
      isPiMsg,
      isProvisional: true,
    };
  } catch (error) {
    logger.error('Error parsing raw message stub', error);
    return null;
  }
}

function parseRawMessage(
  multiProvider: MultiProtocolProvider,
  scrapedChains: DomainsEntry[],
  m: RawMessageDispatchEntry,
): Message | null {
  try {
    const stub = parseRawMessageStub(multiProvider, scrapedChains, m);
    if (!stub) throw new Error('Raw message stub required');

    const originMetadata = multiProvider.tryGetChainMetadata(m.origin_domain);

    return {
      ...stub,
      decodedBody: undefined,
      origin: {
        ...stub.origin,
        blockHash: postgresByteaToString(m.origin_block_hash),
        blockNumber: m.origin_block_height,
        mailbox: postgresByteaToAddress(m.origin_mailbox, originMetadata),
        nonce: 0,
        gasLimit: 0,
        gasPrice: 0,
        effectiveGasPrice: 0,
        gasUsed: 0,
        cumulativeGasUsed: 0,
        maxFeePerGas: 0,
        maxPriorityPerGas: 0,
      },
      destination: undefined,
      totalGasAmount: undefined,
      totalPayment: undefined,
      numPayments: undefined,
    };
  } catch (error) {
    logger.error('Error parsing raw message', error);
    return null;
  }
}

function getMessageStatus(m: MessageEntry | MessageStubEntry) {
  if (m.is_delivered) {
    return MessageStatus.Delivered;
  } else {
    // TODO consider gas and failure conditions here
    return MessageStatus.Pending;
  }
}

function deduplicateMessageList<M extends MessageStub>(messages: Array<M>): Array<M> {
  const map = new Map<string, M>();
  for (const item of messages) {
    const existing = map.get(item.msgId);
    if (!existing) {
      map.set(item.msgId, item);
      continue;
    }
    if (shouldReplaceWithCandidate(existing, item)) {
      map.set(item.msgId, item);
    }
  }
  return Array.from(map.values());
}

function shouldReplaceWithCandidate(current: MessageStub, candidate: MessageStub): boolean {
  const currentScore = scoreMessage(current);
  const candidateScore = scoreMessage(candidate);
  if (candidateScore !== currentScore) return candidateScore > currentScore;
  // If scores tie, keep the freshest row (helps when raw rows tie on score).
  return candidate.origin.timestamp > current.origin.timestamp;
}

function scoreMessage(m: MessageStub): number {
  let score = 0;
  if (!m.isProvisional) score += 100;
  if (m.status === MessageStatus.Delivered) score += 50;
  if (m.destination) score += 25;
  if (m.body.length > 0 && m.body !== '0x') score += 5;
  return score;
}

function chainIdForDomain(multiProvider: MultiProtocolProvider, domainId: number) {
  return multiProvider.tryGetChainMetadata(domainId)?.chainId || domainId;
}
