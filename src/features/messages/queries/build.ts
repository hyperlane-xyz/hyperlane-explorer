import { isAddress } from '@hyperlane-xyz/utils';

import { adjustToUtcTime } from '../../../utils/time';

import { searchValueToPostgresBytea } from './encoding';
import { messageDetailsFragment, messageStubFragment } from './fragments';

/**
 * ========================
 * QUERY ASSEMBLY UTILITIES
 * For building queries
 * ========================
 */

// The list of valid query params to find messages
export enum MessageIdentifierType {
  Id = 'id', // Note: message id, not database id
  Sender = 'sender',
  Recipient = 'recipient',
  OriginTxHash = 'origin-tx-hash',
  OriginTxSender = 'origin-tx-sender',
  DestinationTxHash = 'destination-tx-hash',
  DestinationTxSender = 'destination-tx-sender',
}

export function buildMessageQuery(
  idType: MessageIdentifierType,
  idValue: string,
  limit: number,
  useStub = false,
) {
  let whereClause: string;
  if (idType === MessageIdentifierType.Id) {
    whereClause = 'msg_id: {_eq: $identifier}';
  } else if (idType === MessageIdentifierType.Sender) {
    whereClause = 'sender: {_eq: $identifier}';
  } else if (idType === MessageIdentifierType.Recipient) {
    whereClause = 'recipient: {_eq: $identifier}';
  } else if (idType === MessageIdentifierType.OriginTxHash) {
    whereClause = 'origin_tx_hash: {_eq: $identifier}';
  } else if (idType === MessageIdentifierType.OriginTxSender) {
    whereClause = 'origin_tx_sender: {_eq: $identifier}';
  } else if (idType === MessageIdentifierType.DestinationTxHash) {
    whereClause = 'destination_tx_hash: {_eq: $identifier}';
  } else if (idType === MessageIdentifierType.DestinationTxSender) {
    whereClause = 'destination_tx_sender: {_eq: $identifier}';
  } else {
    throw new Error(`Invalid id type: ${idType}`);
  }
  const variables = { identifier: searchValueToPostgresBytea(idValue) };

  const query = `
  query ($identifier: bytea!) @cached(ttl: 5) {
    message_view(
      where: {${whereClause}}, 
      limit: ${limit}
    ) {
      ${useStub ? messageStubFragment : messageDetailsFragment}
    }
  }
  `;
  return { query, variables };
}

export function buildMessageSearchQuery(
  searchInput: string,
  originDomainIdFilter: number | null,
  destDomainIdFilter: number | null,
  startTimeFilter: number | null,
  endTimeFilter: number | null,
  limit: number,
  useStub = false,
) {
  const originChains = originDomainIdFilter ? [originDomainIdFilter] : undefined;
  const destinationChains = destDomainIdFilter ? [destDomainIdFilter] : undefined;
  const startTime = startTimeFilter ? adjustToUtcTime(startTimeFilter) : undefined;
  const endTime = endTimeFilter ? adjustToUtcTime(endTimeFilter) : undefined;
  const variables = {
    search: searchValueToPostgresBytea(searchInput),
    originChains,
    destinationChains,
    startTime,
    endTime,
  };
  const whereClauses = buildSearchWhereClauses(searchInput);

  // Due to DB performance issues, we cannot use an `_or` clause
  // Instead, each where clause for the search will be its own query
  const queries = whereClauses.map(
    (whereClause, i) =>
      `q${i}: message_view(
    where: {
      _and: [
        ${originDomainIdFilter ? '{origin_domain_id: {_in: $originChains}},' : ''}
        ${destDomainIdFilter ? '{destination_domain_id: {_in: $destinationChains}},' : ''}
        ${startTimeFilter ? '{send_occurred_at: {_gte: $startTime}},' : ''}
        ${endTimeFilter ? '{send_occurred_at: {_lte: $endTime}},' : ''}
        ${whereClause}
      ]
    },
    order_by: {id: desc},
    limit: ${limit}
    ) {
      ${useStub ? messageStubFragment : messageDetailsFragment}
    }`,
  );

  const query = `query ($search: bytea, $originChains: [Int!], $destinationChains: [Int!], $startTime: timestamp, $endTime: timestamp) @cached(ttl: 5) {
    ${queries.join('\n')}
  }`;
  return { query, variables };
}

function buildSearchWhereClauses(searchInput: string) {
  if (!searchInput) return [''];
  if (isAddress(searchInput)) {
    return [
      `{sender: {_eq: $search}}`,
      `{recipient: {_eq: $search}}`,
      `{origin_tx_sender: {_eq: $search}}`,
      `{destination_tx_sender: {_eq: $search}}`,
    ];
  } else {
    return [
      `{msg_id: {_eq: $search}}`,
      `{origin_tx_hash: {_eq: $search}}`,
      `{destination_tx_hash: {_eq: $search}}`,
    ];
  }
}
