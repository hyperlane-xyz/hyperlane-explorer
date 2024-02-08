import { adjustToUtcTime } from '../../../utils/time';

import { stringToPostgresBytea } from './encoding';
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
  const variables = { identifier: stringToPostgresBytea(idValue) };

  const query = `
  query ($identifier: bytea!){
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

// TODO removing destination-based or clauses for now due to DB load
// Queries will need to be restructured into multiple requests
// https://github.com/hyperlane-xyz/hyperlane-explorer/issues/59
// {destination_tx_hash: {_eq: $search}},
// {destination_tx_sender: {_eq: $search}},
const searchWhereClause = `
  {_or: [
    {msg_id: {_eq: $search}},
    {sender: {_eq: $search}},
    {recipient: {_eq: $search}},
    {origin_tx_hash: {_eq: $search}},
    {origin_tx_sender: {_eq: $search}},
  ]}
`;

export function buildMessageSearchQuery(
  searchInput: string,
  originFilter: string | null,
  destFilter: string | null,
  startTimeFilter: number | null,
  endTimeFilter: number | null,
  limit: number,
  useStub = false,
) {
  const hasInput = !!searchInput;

  const originChains = originFilter ? originFilter.split(',') : undefined;
  const destinationChains = destFilter ? destFilter.split(',') : undefined;
  const startTime = startTimeFilter ? adjustToUtcTime(startTimeFilter) : undefined;
  const endTime = endTimeFilter ? adjustToUtcTime(endTimeFilter) : undefined;
  const variables = {
    search: hasInput ? stringToPostgresBytea(searchInput) : undefined,
    originChains,
    destinationChains,
    startTime,
    endTime,
  };

  const query = `
  query ($search: bytea, $originChains: [bigint!], $destinationChains: [bigint!], $startTime: timestamp, $endTime: timestamp) {
    message_view(
      where: {
        _and: [
          ${originFilter ? '{origin_chain_id: {_in: $originChains}},' : ''}
          ${destFilter ? '{destination_chain_id: {_in: $destinationChains}},' : ''}
          ${startTimeFilter ? '{send_occurred_at: {_gte: $startTime}},' : ''}
          ${endTimeFilter ? '{send_occurred_at: {_lte: $endTime}},' : ''}
          ${hasInput ? searchWhereClause : ''}
        ]
      },
      order_by: {send_occurred_at: desc},
      limit: ${limit}
      ) {
        ${useStub ? messageStubFragment : messageDetailsFragment}
      }
  }
  `;
  return { query, variables };
}
