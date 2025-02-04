import { ChainMetadata, MultiProvider } from '@hyperlane-xyz/sdk';

import {
  Message,
  MessageStatus,
  MessageStub,
  WarpRouteDetails,
  WarpRouteMap,
} from '../../../types';
import { logger } from '../../../utils/logger';
import { tryUtf8DecodeBytes } from '../../../utils/string';
import { DomainsEntry } from '../../chains/queries/fragments';
import { isPiChain } from '../../chains/utils';

import { fromWei, objKeys, parseWarpRouteMessage } from '@hyperlane-xyz/utils';
import { postgresByteaToAddress, postgresByteaToString, postgresByteaToTxHash } from './encoding';
import {
  MessageEntry,
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
  multiProvider: MultiProvider,
  scrapedChains: DomainsEntry[],
  data: MessagesStubQueryResult | undefined,
): MessageStub[] {
  return queryResult(multiProvider, scrapedChains, data, parseMessageStub);
}

export function parseMessageQueryResult(
  multiProvider: MultiProvider,
  scrapedChains: DomainsEntry[],
  data: MessagesQueryResult | undefined,
): Message[] {
  return queryResult(multiProvider, scrapedChains, data, parseMessage);
}

function getTokenSymbolFromWarpRouteMap(
  chainMetadata: ChainMetadata,
  address: Address,
  warpRouteMap: WarpRouteMap,
) {
  const { name } = chainMetadata;

  if (objKeys(warpRouteMap).includes(name)) {
    const chain = warpRouteMap[name];
    if (objKeys(chain).includes(address)) {
      return chain[address];
    }
  }

  return undefined;
}

export function parseWarpRouteDetails(
  message: Message,
  warpRouteMap: WarpRouteMap,
): WarpRouteDetails | undefined {
  try {
    const {
      body,
      origin: { to },
      totalPayment,
      originMetadata,
      destinationMetadata,
      sender,
      recipient,
    } = message;

    if (!body || !originMetadata || !destinationMetadata) return undefined;

    const originTokenSymbol = getTokenSymbolFromWarpRouteMap(originMetadata, sender, warpRouteMap);
    const destinationTokenSymbol = getTokenSymbolFromWarpRouteMap(
      destinationMetadata,
      recipient,
      warpRouteMap,
    );

    if (!originTokenSymbol || !destinationTokenSymbol) return undefined;

    const parsedMessage = parseWarpRouteMessage(body);
    const address = postgresByteaToAddress(parsedMessage.recipient, destinationMetadata);

    return {
      amount: fromWei(parsedMessage.amount.toString(), originMetadata.nativeToken?.decimals || 18),
      totalPayment: totalPayment
        ? fromWei(totalPayment, originMetadata.nativeToken?.decimals || 18)
        : 'Unknown',
      endRecipient: address,
      originTokenAddress: to,
      originTokenSymbol: originTokenSymbol,
      destinationTokenAddress: recipient,
      destinationTokenSymbol: destinationTokenSymbol,
    };
  } catch (err) {
    logger.error('Error parsing warp route details:', err);
    return undefined;
  }
}

function queryResult<D, M extends MessageStub>(
  multiProvider: MultiProvider,
  scrapedChains: DomainsEntry[],
  data: Record<string, D[]> | undefined,
  parseFn: (multiProvider: MultiProvider, scrapedChains: DomainsEntry[], data: D) => M | null,
) {
  if (!data || !Object.keys(data).length) return [];
  return deduplicateMessageList(
    Object.values(data)
      .flat()
      .map((d) => parseFn(multiProvider, scrapedChains, d))
      .filter((m): m is M => !!m)
      .sort((a, b) => b.origin.timestamp - a.origin.timestamp),
  );
}

function parseMessageStub(
  multiProvider: MultiProvider,
  scrapedChains: DomainsEntry[],
  m: MessageStubEntry,
): MessageStub | null {
  try {
    const originMetadata = multiProvider.tryGetChainMetadata(m.origin_domain_id);
    const destinationMetadata = multiProvider.tryGetChainMetadata(m.destination_domain_id);

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
      origin: {
        timestamp: parseTimestampString(m.send_occurred_at),
        hash: postgresByteaToTxHash(m.origin_tx_hash, originMetadata),
        from: postgresByteaToAddress(m.origin_tx_sender, originMetadata),
      },
      destination: m.is_delivered
        ? {
            timestamp: parseTimestampString(m.delivery_occurred_at!),
            hash: postgresByteaToTxHash(m.destination_tx_hash!, destinationMetadata),
            from: postgresByteaToAddress(m.destination_tx_sender!, destinationMetadata),
          }
        : undefined,
      isPiMsg,
      originMetadata,
      destinationMetadata,
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
      originMetadata,
      destinationMetadata,
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

function deduplicateMessageList<M extends MessageStub>(messages: Array<M>): Array<M> {
  const map = new Map();
  for (const item of messages) {
    map.set(item.id, item);
  }
  return Array.from(map.values());
}
