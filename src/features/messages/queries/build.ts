import { isAddress } from '@hyperlane-xyz/utils';

import { LIVE_MESSAGE_LIMIT } from '../../../consts/api';
import { MessageStatusFilter } from '../../../types';
import { adjustToUtcTime } from '../../../utils/time';
import { isPotentiallyTransactionHash, searchValueToPostgresBytea } from './encoding';
import { messageDetailsFragment, messageStubFragment } from './fragments';

export const PROVISIONAL_QUERY_KEY = 'provisional';

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

export type MessagePageCursor =
  | { after: string; before?: never }
  | { after?: never; before: string }
  | { after?: never; before?: never };

export function buildMessageQuery(
  idType: MessageIdentifierType,
  idValue: string,
  limit: number,
  useStub = false,
  orderBy?: string,
  { cached = true }: { cached?: boolean } = {},
) {
  const field = {
    [MessageIdentifierType.Id]: 'msg_id',
    [MessageIdentifierType.Sender]: 'sender',
    [MessageIdentifierType.Recipient]: 'recipient',
    [MessageIdentifierType.OriginTxHash]: 'origin_tx_hash',
    [MessageIdentifierType.OriginTxSender]: 'origin_tx_sender',
    [MessageIdentifierType.DestinationTxHash]: 'destination_tx_hash',
    [MessageIdentifierType.DestinationTxSender]: 'destination_tx_sender',
  }[idType];
  if (typeof field !== 'string') throw new Error(`Invalid id type: ${idType}`);
  const variables = { identifier: searchValueToPostgresBytea(idValue) };

  const query = `
  query ($identifier: bytea!)${cached ? ' @cached(ttl: 5)' : ''} {
    message_view(
      confirmations: 0,
      where: {send_occurred_at: {_is_null: false}, ${field}: {_eq: $identifier}},
      ${orderBy ? `order_by: {${orderBy}},` : ''}
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
  scopeDomainIds?: number[],
  statusFilter: MessageStatusFilter = 'all',
  warpRouteAddresses: string[] = [],
  {
    cached = true,
    after,
    before,
  }: {
    cached?: boolean;
  } & MessagePageCursor = {},
) {
  if (after && before) throw new Error('Message query cannot use both before and after cursors');
  const cursor = before || after;
  const orderDirection = before ? 'ASC' : 'DESC';
  const originChains = originDomainIdFilter ? [originDomainIdFilter] : undefined;
  const destinationChains = destDomainIdFilter ? [destDomainIdFilter] : undefined;
  const startTime = startTimeFilter ? adjustToUtcTime(startTimeFilter) : undefined;
  const endTime = endTimeFilter ? adjustToUtcTime(endTimeFilter) : undefined;

  // Convert warp route addresses to bytea format, filtering out any invalid addresses
  const warpAddressesBytea = warpRouteAddresses
    .map((addr) => searchValueToPostgresBytea(addr))
    .filter((addr): addr is string => !!addr);

  const variables: Record<string, unknown> = {
    search: searchValueToPostgresBytea(searchInput),
    originChains,
    destinationChains,
    startTime,
    endTime,
  };
  if (cursor) variables.cursor = cursor;

  // Only add warpAddresses to variables if there are valid addresses to filter
  if (warpAddressesBytea.length > 0) {
    variables.warpAddresses = warpAddressesBytea;
  }

  const whereClauses = buildSearchWhereClauses(searchInput);
  const originDomainWhereClause = buildDomainIdWhereClause(
    originDomainIdFilter,
    'origin',
    scopeDomainIds,
  );
  const destinationDomainWhereClause = buildDomainIdWhereClause(
    destDomainIdFilter,
    'destination',
    scopeDomainIds,
  );

  // Due to DB performance issues, we cannot use an `_or` clause
  // Instead, each where clause for the search will be its own query
  // Raw dispatch IDs and canonical message IDs use different sequences.
  // Fetch the provisional overlay separately so canonical pagination cannot
  // push fresh dispatches below the LIMIT or use their IDs as history cursors.
  const selections = whereClauses.map((whereClause, i) => ({
    alias: `q${i}`,
    whereClause,
    provisional: false,
  }));
  if (!cursor) {
    selections.push({
      alias: PROVISIONAL_QUERY_KEY,
      // OR is cheap over the small provisional set and avoids repeating the
      // projection once per identifier field (or exceeding GraphQL limits).
      whereClause: whereClauses.length > 1 ? `{_or: [${whereClauses.join(',')}]}` : whereClauses[0],
      provisional: true,
    });
  }
  const queries = selections.map(
    ({ alias, whereClause, provisional }) =>
      `${alias}: message_view(
    ${provisional ? 'confirmations: 0,' : ''}
    where: {
      _and: [
        {send_occurred_at: {_is_null: false}},
        ${provisional ? '{is_provisional: {_eq: true}},' : ''}
        ${originDomainWhereClause}
        ${destinationDomainWhereClause}
        ${startTimeFilter ? '{send_occurred_at: {_gte: $startTime}},' : ''}
        ${endTimeFilter ? '{send_occurred_at: {_lte: $endTime}},' : ''}
        ${statusFilter === 'delivered' ? '{is_delivered: {_eq: true}},' : ''}
        ${warpAddressesBytea.length ? '{_or: [{sender: {_in: $warpAddresses}}, {recipient: {_in: $warpAddresses}}]},' : ''}
        ${whereClause}
      ]
    },
    order_by: ${provisional ? '[{send_occurred_at: desc}, {id: desc}]' : `{id: ${orderDirection.toLowerCase()}}`},
    limit: ${provisional ? LIVE_MESSAGE_LIMIT : limit}${cursor ? `,\n    cursor: [{initial_value: {id: $cursor}, ordering: ${orderDirection}}]` : ''}
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
  if (cursor) variableDeclarations.push('$cursor: bigint!');
  if (warpAddressesBytea.length > 0) {
    variableDeclarations.push('$warpAddresses: [bytea!]');
  }

  const query = `query (${variableDeclarations.join(', ')})${cached ? ' @cached(ttl: 5)' : ''} {
    ${queries.join('\n')}
  }`;
  return { query, variables };
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
  fieldName: 'origin' | 'destination',
  scopeDomainIds: number[] = [],
) {
  if (domainId) return `{${fieldName}_domain_id: {_in: $${fieldName}Chains}},`;
  return scopeDomainIds.length ? `{${fieldName}_domain_id: {_in: [${scopeDomainIds}]}},` : '';
}
