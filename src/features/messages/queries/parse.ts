import type { ChainMetadataResolver } from '@hyperlane-xyz/sdk/metadata/ChainMetadataResolver';

import { Message, MessageStatus, MessageStub } from '../../../types';
import { logger } from '../../../utils/logger';
import { tryUtf8DecodeBytes } from '../../../utils/string';
import { DomainsEntry } from '../../chains/queries/fragments';
import { isPiChain } from '../../chains/utils';
import { postgresByteaToAddress, postgresByteaToString, postgresByteaToTxHash } from './encoding';
import {
  MessageEntry,
  MessageDetailsQueryResult,
  MessagesQueryResult,
  MessagesStubQueryResult,
  MessageStubEntry,
} from './fragments';

/**
 * ========================
 * RESULT PARSING UTILITIES
 * For parsing raw results
 * ========================
 */

export function parseMessageStubResult(
  chainMetadataResolver: ChainMetadataResolver,
  scrapedChains: DomainsEntry[],
  data: MessagesStubQueryResult | undefined,
): MessageStub[] {
  return queryResult(chainMetadataResolver, scrapedChains, data, parseMessageStubEntry);
}

export function parseMessageQueryResult(
  chainMetadataResolver: ChainMetadataResolver,
  scrapedChains: DomainsEntry[],
  data: MessagesQueryResult | MessageDetailsQueryResult | undefined,
): Message[] {
  const { canonical, ...entries } = data ?? {};
  return queryResult(chainMetadataResolver, scrapedChains, entries, (resolver, chains, row) => {
    const message = parseMessageEntry(resolver, chains, row);
    if (!message) return null;
    const originConfirmed = canonical?.some(
      (confirmed) =>
        confirmed.msg_id === row.msg_id &&
        confirmed.origin_tx_hash === row.origin_tx_hash &&
        confirmed.origin_block_hash === row.origin_block_hash,
    );
    return { ...message, isOriginProvisional: !!message.isProvisional && !originConfirmed };
  });
}

function queryResult<D, M extends MessageStub>(
  chainMetadataResolver: ChainMetadataResolver,
  scrapedChains: DomainsEntry[],
  data: Record<string, D[] | null | undefined> | undefined,
  parseFn: (
    chainMetadataResolver: ChainMetadataResolver,
    scrapedChains: DomainsEntry[],
    data: D,
  ) => M | null,
) {
  const messages = Object.values(data ?? {})
    .flatMap((rows) => rows ?? [])
    .map((row) => parseFn(chainMetadataResolver, scrapedChains, row))
    .filter((message): message is M => !!message);
  return [
    ...new Map(messages.map((message) => [message.msgId.toLowerCase(), message])).values(),
  ].sort((a, b) => b.origin.timestamp - a.origin.timestamp);
}

export function compareMessageIdsDescending(a: MessageStub, b: MessageStub): number {
  const aId = BigInt(a.id);
  const bId = BigInt(b.id);
  return aId === bId ? 0 : aId > bId ? -1 : 1;
}

export function parseMessageStubEntry(
  chainMetadataResolver: ChainMetadataResolver,
  scrapedChains: DomainsEntry[],
  m: MessageStubEntry,
): MessageStub | null {
  try {
    const originMetadata = chainMetadataResolver.tryGetChainMetadata(m.origin_domain_id);
    const destinationMetadata = chainMetadataResolver.tryGetChainMetadata(m.destination_domain_id);
    const body = m.message_body ? postgresByteaToString(m.message_body) : '0x';

    const isPiMsg =
      isPiChain(chainMetadataResolver, scrapedChains, m.origin_domain_id) ||
      isPiChain(chainMetadataResolver, scrapedChains, m.destination_domain_id);
    return {
      status: m.is_delivered ? MessageStatus.Delivered : MessageStatus.Pending,
      isProvisional: m.is_provisional ?? m.live_confirmations === 0,
      liveReceivedAt: m.live_received_at,
      isOriginProvisional:
        m.is_provisional === false
          ? false
          : m.live_received_at === undefined
            ? undefined
            : m.live_confirmations === 0,
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
        blockNumber: parseBlockNumber(m.origin_block_height),
        timestamp: parseTimestampString(m.send_occurred_at),
        hash: postgresByteaToTxHash(m.origin_tx_hash, originMetadata),
        from: parseOptionalAddress(m.origin_tx_sender, originMetadata),
        to: parseOptionalAddress(m.origin_tx_recipient, originMetadata),
      },
      destination: hasDestinationTransaction(m)
        ? {
            timestamp: parseTimestampString(m.delivery_occurred_at),
            hash: postgresByteaToTxHash(m.destination_tx_hash, destinationMetadata),
            from: parseOptionalAddress(m.destination_tx_sender, destinationMetadata),
            to: parseOptionalAddress(m.destination_tx_recipient, destinationMetadata),
          }
        : undefined,
      isPiMsg,
    };
  } catch (error) {
    logger.error('Error parsing message stub', error);
    return null;
  }
}

export function parseMessageEntry(
  chainMetadataResolver: ChainMetadataResolver,
  scrapedChains: DomainsEntry[],
  m: MessageEntry,
): Message | null {
  try {
    const stub = parseMessageStubEntry(chainMetadataResolver, scrapedChains, m);
    if (!stub) throw new Error('Message stub required');
    const originBlockNumber = parseBlockNumber(m.origin_block_height);
    if (originBlockNumber === undefined) throw new Error('Origin block number required');

    const originMetadata = chainMetadataResolver.tryGetChainMetadata(m.origin_domain_id);
    const destinationMetadata = chainMetadataResolver.tryGetChainMetadata(m.destination_domain_id);

    const decodedBody = tryUtf8DecodeBytes(stub.body);

    return {
      ...stub,
      decodedBody,
      origin: {
        ...stub.origin,
        blockHash: postgresByteaToString(m.origin_block_hash),
        blockNumber: originBlockNumber,
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
            blockHash: m.destination_block_hash
              ? postgresByteaToString(m.destination_block_hash)
              : undefined,
            blockNumber: parseBlockNumber(m.destination_block_height),
            mailbox: parseOptionalAddress(m.destination_mailbox, destinationMetadata),
            nonce: m.destination_tx_nonce ?? undefined,
            gasLimit: m.destination_tx_gas_limit ?? undefined,
            gasPrice: m.destination_tx_gas_price ?? undefined,
            effectiveGasPrice: m.destination_tx_effective_gas_price ?? undefined,
            gasUsed: m.destination_tx_gas_used ?? undefined,
            cumulativeGasUsed: m.destination_tx_cumulative_gas_used ?? undefined,
            maxFeePerGas: m.destination_tx_max_fee_per_gas ?? undefined,
            maxPriorityPerGas: m.destination_tx_max_priority_fee_per_gas ?? undefined,
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

export function parseBlockNumber(value: unknown) {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return value;
  if (typeof value !== 'string' || !/^(?:0|[1-9][0-9]*)$/.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function hasDestinationTransaction(m: MessageStubEntry): m is MessageStubEntry & {
  delivery_occurred_at: string;
  destination_tx_hash: string;
} {
  return Boolean(m.delivery_occurred_at && m.destination_tx_hash);
}

function parseOptionalAddress(
  value: string | null,
  metadata: Parameters<typeof postgresByteaToAddress>[1],
) {
  return value ? postgresByteaToAddress(value, metadata) : undefined;
}
