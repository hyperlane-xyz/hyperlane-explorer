import { trimLeading0x } from '../../../utils/addresses';
import { adjustToUtcTime } from '../../../utils/time';

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
    whereClause = 'sender: {_ilike: $identifier}';
  } else if (idType === MessageIdentifierType.Recipient) {
    whereClause = 'recipient: {_ilike: $identifier}';
  } else if (idType === MessageIdentifierType.OriginTxHash) {
    whereClause = 'transaction: {hash: {_ilike: $identifier}}';
  } else if (idType === MessageIdentifierType.OriginTxSender) {
    whereClause = 'transaction: {sender: {_ilike: $identifier}}';
  } else if (idType === MessageIdentifierType.DestinationTxHash) {
    whereClause = 'delivered_message: {transaction: {hash: {_ilike: $identifier}}}';
  } else if (idType === MessageIdentifierType.DestinationTxSender) {
    whereClause = 'delivered_message: {transaction: {sender: {_ilike: $identifier}}}';
  } else {
    throw new Error(`Invalid id type: ${idType}`);
  }
  const variables = { identifier: idValue };

  const query = `
  query ($identifier: String!){
    message(
      where: {${whereClause}}, 
      limit: ${limit}
    ) {
      ${useStub ? messageStubFragment : messageDetailsFragment}
    }
  }
  `;
  return { query, variables };
}

const searchWhereClause = `
  {_or: [
    {msg_id: {_eq: $search}},
    {sender: {_eq: $search}},
    {recipient: {_eq: $search}},
    {transaction: {hash: {_eq: $search}}},
    {transaction: {sender: {_eq: $search}}},
    {delivered_message: {transaction: {hash: {_eq: $search}}}},
    {delivered_message: {transaction: {sender: {_eq: $search}}}}
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
    search: hasInput ? trimLeading0x(searchInput) : undefined,
    originChains,
    destinationChains,
    startTime,
    endTime,
  };

  const query = `
  query ($search: String, $originChains: [Int!], $destinationChains: [Int!], $startTime: timestamp, $endTime: timestamp) {
    message(
      where: {
        _and: [
          ${originFilter ? '{origin: {_in: $originChains}},' : ''}
          ${destFilter ? '{destination: {_in: $destinationChains}},' : ''}
          ${startTimeFilter ? '{timestamp: {_gte: $startTime}},' : ''}
          ${endTimeFilter ? '{timestamp: {_lte: $endTime}},' : ''}
          ${hasInput ? searchWhereClause : ''}
        ]
      },
      order_by: {timestamp: desc},
      limit: ${limit}
      ) {
        ${useStub ? messageStubFragment : messageDetailsFragment}
      }
  }
  `;
  return { query, variables };
}
