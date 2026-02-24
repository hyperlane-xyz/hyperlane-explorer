import { config } from '../../../consts/config';
import { logger } from '../../../utils/logger';

import { postgresByteaToString, stringToPostgresBytea } from './encoding';
import {
  MessagesStubQueryResult,
  MessageStubEntry,
  RawMessageDispatchEntry,
  rawMessageDispatchFragment,
  messageStubFragment,
} from './fragments';

/**
 * Server-side utility to fetch message data from GraphQL for OG meta tags
 * This is used in getServerSideProps to fetch minimal message info
 */
export async function fetchMessageForOG(messageId: string): Promise<MessageOGData | null> {
  // Validate messageId format (must be 0x-prefixed hex string)
  if (!messageId || !/^0x[0-9a-f]+$/i.test(messageId)) return null;
  const identifier = stringToPostgresBytea(messageId);

  const query = `
    query ($identifier: bytea!) @cached(ttl: 5) {
      message_view(
        where: {msg_id: {_eq: $identifier}},
        limit: 1
      ) {
        ${messageStubFragment}
      }
      raw_message_dispatch(
        where: {msg_id: {_eq: $identifier}},
        order_by: [{time_updated: desc}, {id: desc}],
        limit: 1
      ) {
        ${rawMessageDispatchFragment}
      }
    }
  `;

  try {
    const response = await fetch(config.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        variables: { identifier },
      }),
    });

    if (!response.ok) return null;

    const result = await response.json();
    const data = result.data as
      | (MessagesStubQueryResult & { raw_message_dispatch?: RawMessageDispatchEntry[] })
      | undefined;

    if (!data?.message_view?.length && !data?.raw_message_dispatch?.length) return null;

    if (data?.message_view?.length) {
      const message = data.message_view[0];
      return parseMessageForOG(message);
    }
    if (data?.raw_message_dispatch?.length) {
      return parseRawMessageForOG(data.raw_message_dispatch[0]);
    }
    return null;
  } catch (error) {
    logger.error('Error fetching message for OG:', error);
    return null;
  }
}

export interface MessageOGData {
  msgId: string;
  status: 'Delivered' | 'Pending' | 'Unknown';
  originDomainId: number;
  destinationDomainId: number;
  originTxHash: string;
  timestamp: number;
  sender: string;
  recipient: string;
  body: string | null;
  deliveryLatency: string | null;
}

function parseMessageForOG(message: MessageStubEntry): MessageOGData {
  return {
    msgId: postgresByteaToString(message.msg_id),
    status: message.is_delivered ? 'Delivered' : 'Pending',
    originDomainId: message.origin_domain_id,
    destinationDomainId: message.destination_domain_id,
    originTxHash: postgresByteaToString(message.origin_tx_hash),
    timestamp: new Date(message.send_occurred_at + 'Z').getTime(),
    sender: postgresByteaToString(message.sender),
    recipient: postgresByteaToString(message.recipient),
    body: message.message_body ? postgresByteaToString(message.message_body) : null,
    deliveryLatency: message.delivery_latency,
  };
}

function parseRawMessageForOG(message: RawMessageDispatchEntry): MessageOGData {
  const rawTimestamp = message.time_updated || message.time_created;
  const timestampWithZone = rawTimestamp.at(-1) === 'Z' ? rawTimestamp : `${rawTimestamp}Z`;
  return {
    msgId: postgresByteaToString(message.msg_id),
    status: 'Pending',
    originDomainId: message.origin_domain,
    destinationDomainId: message.destination_domain,
    originTxHash: postgresByteaToString(message.origin_tx_hash),
    timestamp: new Date(timestampWithZone).getTime(),
    sender: postgresByteaToString(message.sender),
    recipient: postgresByteaToString(message.recipient),
    body: null,
    deliveryLatency: null,
  };
}

/**
 * Fetch chain names from the domains table
 */
export async function fetchDomainNames(): Promise<Map<number, string>> {
  const domainMap = new Map<number, string>();

  const query = `
    query @cached {
      domain {
        id
        name
      }
    }
  `;

  try {
    const response = await fetch(config.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    });

    if (!response.ok) return domainMap;

    const result = await response.json();
    const domains = result.data?.domain as Array<{ id: number; name: string }> | undefined;

    if (!domains) return domainMap;

    for (const domain of domains) {
      domainMap.set(domain.id, domain.name);
    }
    return domainMap;
  } catch (error) {
    logger.error('Error fetching domain names:', error);
    return domainMap;
  }
}
