import { isAddress } from '@hyperlane-xyz/utils';

import { MessageStatusFilter } from '../../../types';
import { adjustToUtcTime } from '../../../utils/time';

import { isPotentiallyTransactionHash, searchValueToPostgresBytea } from './encoding';
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
  mainnetDomainIds?: number[],
  statusFilter: MessageStatusFilter = 'all',
  warpRouteAddresses: string[] = [],
  offset: number = 0,
) {
  const originChains = originDomainIdFilter ? [originDomainIdFilter] : undefined;
  const destinationChains = destDomainIdFilter ? [destDomainIdFilter] : undefined;
  const startTime = startTimeFilter ? adjustToUtcTime(startTimeFilter) : undefined;
  const endTime = endTimeFilter ? adjustToUtcTime(endTimeFilter) : undefined;

  // Convert warp route addresses to bytea format
  const warpAddressesBytea = warpRouteAddresses.map((addr) => searchValueToPostgresBytea(addr));

  const variables: Record<string, unknown> = {
    search: searchValueToPostgresBytea(searchInput),
    originChains,
    destinationChains,
    startTime,
    endTime,
  };

  // Only add warpAddresses to variables if there are addresses to filter
  if (warpAddressesBytea.length > 0) {
    variables.warpAddresses = warpAddressesBytea;
  }

  const hasFilters = !!(
    originDomainIdFilter ||
    destDomainIdFilter ||
    startTimeFilter ||
    endTimeFilter ||
    searchInput ||
    statusFilter !== 'all' ||
    warpRouteAddresses.length > 0
  );
  const whereClauses = buildSearchWhereClauses(searchInput);
  const originDomainWhereClause = buildDomainIdWhereClause(
    originDomainIdFilter,
    hasFilters,
    'origin',
    mainnetDomainIds,
  );
  const destinationDomainWhereClause = buildDomainIdWhereClause(
    destDomainIdFilter,
    hasFilters,
    'destination',
    mainnetDomainIds,
  );

  // Build status filter clause
  const statusWhereClause = buildStatusWhereClause(statusFilter);

  // Build warp route address filter clause
  const warpRouteWhereClause = buildWarpRouteWhereClause(warpRouteAddresses);

  // Due to DB performance issues, we cannot use an `_or` clause
  // Instead, each where clause for the search will be its own query
  const queries = whereClauses.map(
    (whereClause, i) =>
      `q${i}: message_view(
    where: {
      _and: [
        ${originDomainWhereClause}
        ${destinationDomainWhereClause}
        ${startTimeFilter ? '{send_occurred_at: {_gte: $startTime}},' : ''}
        ${endTimeFilter ? '{send_occurred_at: {_lte: $endTime}},' : ''}
        ${statusWhereClause}
        ${warpRouteWhereClause}
        ${whereClause}
      ]
    },
    order_by: {id: desc},
    limit: ${limit},
    offset: ${offset}
    ) {
      ${useStub ? messageStubFragment : messageDetailsFragment}
    }`,
  );

  // Build the variable declarations for the query
  const variableDeclarations = [
    '$search: bytea',
    '$originChains: [Int!]',
    '$destinationChains: [Int!]',
    '$startTime: timestamp',
    '$endTime: timestamp',
  ];
  if (warpAddressesBytea.length > 0) {
    variableDeclarations.push('$warpAddresses: [bytea!]');
  }

  const query = `query (${variableDeclarations.join(', ')}) @cached(ttl: 5) {
    ${queries.join('\n')}
  }`;
  return { query, variables };
}

function buildStatusWhereClause(statusFilter: MessageStatusFilter): string {
  if (statusFilter === 'delivered') {
    return '{is_delivered: {_eq: true}},';
  } else if (statusFilter === 'pending') {
    return '{is_delivered: {_eq: false}},';
  }
  return '';
}

function buildWarpRouteWhereClause(warpRouteAddresses: string[]): string {
  if (warpRouteAddresses.length === 0) return '';
  // Filter messages where sender OR recipient is in the warp route addresses
  return '{_or: [{sender: {_in: $warpAddresses}}, {recipient: {_in: $warpAddresses}}]},';
}

function buildSearchWhereClauses(searchInput: string) {
  if (!searchInput) return [''];

  const clauses: string[] = [];
  if (isAddress(searchInput)) {
    clauses.push(
      `{sender: {_eq: $search}}`,
      `{recipient: {_eq: $search}}`,
      `{origin_tx_sender: {_eq: $search}}`,
      `{destination_tx_sender: {_eq: $search}}`,
    );
  }
  if (isPotentiallyTransactionHash(searchInput)) {
    clauses.push(`{origin_tx_hash: {_eq: $search}}`, `{destination_tx_hash: {_eq: $search}}`);
  }
  clauses.push(`{msg_id: {_eq: $search}}`);

  return clauses;
}

function buildDomainIdWhereClause(
  domainId: number | null,
  hasFilters: boolean,
  fieldName: 'origin' | 'destination',
  mainnetDomainIds: number[] = [],
) {
  // if no filters are set, filter by mainnet chains to not display testnest messages for vanilla query
  if (!hasFilters) return `{${fieldName}_domain_id: {_in: [${mainnetDomainIds}]}},`;

  // if the domainId is set, filter by this domainId instead of mainnet domains
  if (domainId) return `{${fieldName}_domain_id: {_in: $${fieldName}Chains}},`;

  // if domainId is not set but there are other filters, remove condition of filtering by mainnet chains
  return '';
}
