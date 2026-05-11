import { useMemo } from 'react';
import { useQuery } from 'urql';

import { searchValueToPostgresBytea } from '../messages/queries/encoding';

const TRANSACTION_MESSAGE_COUNT_QUERY = `
  query ($identifier: bytea!) @cached(ttl: 5) {
    message_view_aggregate(where: {origin_tx_hash: {_eq: $identifier}}) {
      aggregate {
        count
      }
    }
  }
`;

export function useTransactionMessageCount(originTxHash: string | undefined) {
  const variables = useMemo(
    () => ({ identifier: searchValueToPostgresBytea(originTxHash || '') }),
    [originTxHash],
  );

  const [{ data }] = useQuery<TransactionMessageCountQueryResult>({
    query: TRANSACTION_MESSAGE_COUNT_QUERY,
    variables,
    pause: !originTxHash,
  });

  return data?.message_view_aggregate.aggregate?.count ?? 0;
}

interface TransactionMessageCountQueryResult {
  message_view_aggregate: {
    aggregate: {
      count: number;
    } | null;
  };
}
