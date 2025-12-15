import { config } from '../consts/config';
import {
  MessagesStubQueryResult,
  MessageStubEntry,
  messageStubFragment,
} from '../features/messages/queries/fragments';

import { postgresByteaToHex, stringToPostgresBytea } from './bytea';
import { logger } from './logger';

/**
 * Server-side utility to fetch message data from GraphQL for OG meta tags
 * This is used in getServerSideProps to fetch minimal message info
 */
export async function fetchMessageForOG(messageId: string): Promise<MessageOGData | null> {
  const identifier = stringToPostgresBytea(messageId);
  if (!identifier) return null;

  const query = `
    query ($identifier: bytea!) @cached(ttl: 5) {
      message_view(
        where: {msg_id: {_eq: $identifier}},
        limit: 1
      ) {
        ${messageStubFragment}
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
    const data = result.data as MessagesStubQueryResult | undefined;

    if (!data?.message_view?.length) return null;

    const message = data.message_view[0];
    return parseMessageForOG(message);
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
}

function parseMessageForOG(message: MessageStubEntry): MessageOGData {
  return {
    msgId: postgresByteaToHex(message.msg_id),
    status: message.is_delivered ? 'Delivered' : 'Pending',
    originDomainId: message.origin_domain_id,
    destinationDomainId: message.destination_domain_id,
    originTxHash: postgresByteaToHex(message.origin_tx_hash),
    timestamp: new Date(message.send_occurred_at + 'Z').getTime(),
  };
}

/**
 * Fetch chain names from the domains table
 */
export async function fetchDomainNames(): Promise<Map<number, string>> {
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

    if (!response.ok) return new Map();

    const result = await response.json();
    const domains = result.data?.domain as Array<{ id: number; name: string }> | undefined;

    if (!domains) return new Map();

    const map = new Map<number, string>();
    for (const domain of domains) {
      map.set(domain.id, domain.name);
    }
    return map;
  } catch (error) {
    logger.error('Error fetching domain names:', error);
    return new Map();
  }
}
