import { config } from '../../../consts/config';
import { logger } from '../../../utils/logger';
import { postgresByteaToString, stringToPostgresBytea } from './encoding';
import type { MessageStubEntry } from './fragments';

const ogHeaderFields = 'origin_domain_id destination_domain_id send_occurred_at';
const ogImageFields = `${ogHeaderFields} msg_id is_delivered sender message_body delivery_latency`;

type MessageOGHeaderEntry = Pick<
  MessageStubEntry,
  'origin_domain_id' | 'destination_domain_id' | 'send_occurred_at'
>;
type MessageOGImageEntry = MessageOGHeaderEntry &
  Pick<MessageStubEntry, 'msg_id' | 'is_delivered' | 'sender' | 'message_body'> & {
    delivery_latency: string | null;
  };

export function isOGMessageId(messageId: string): boolean {
  return /^0x[0-9a-f]+$/i.test(messageId);
}

async function fetchOGMessage<T extends MessageOGHeaderEntry, R>(
  messageId: string,
  fields: string,
  parse: (message: T) => R,
): Promise<R | null> {
  if (!isOGMessageId(messageId)) return null;
  const identifier = stringToPostgresBytea(messageId);

  const query = `
    query ($identifier: bytea!) @cached(ttl: 5) {
      message_view(
        where: {msg_id: {_eq: $identifier}},
        limit: 1
      ) {
        ${fields}
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
    const data = result.data as { message_view?: T[] | null } | undefined;
    const message = data?.message_view?.[0];
    return message ? parse(message) : null;
  } catch (error) {
    logger.error('Error fetching message for OG:', error);
    return null;
  }
}

export function fetchMessageHeaderForOG(messageId: string) {
  return fetchOGMessage(messageId, ogHeaderFields, parseMessageHeaderForOG);
}

export function fetchMessageForOG(messageId: string) {
  return fetchOGMessage(messageId, ogImageFields, parseMessageForOG);
}

function parseMessageForOG(message: MessageOGImageEntry) {
  return {
    ...parseMessageHeaderForOG(message),
    msgId: postgresByteaToString(message.msg_id),
    isDelivered: message.is_delivered,
    sender: postgresByteaToString(message.sender),
    body: message.message_body ? postgresByteaToString(message.message_body) : null,
    deliveryLatency: message.delivery_latency,
  };
}

function parseMessageHeaderForOG(message: MessageOGHeaderEntry) {
  return {
    originDomainId: message.origin_domain_id,
    destinationDomainId: message.destination_domain_id,
    timestamp: new Date(message.send_occurred_at + 'Z').getTime(),
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
