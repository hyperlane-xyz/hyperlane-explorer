import { useCallback, useMemo } from 'react';
import { useQuery } from 'urql';

import { isValidAddressFast, isValidTransactionHash } from '../../../utils/addresses';
import { useInterval } from '../../../utils/useInterval';
import { buildMessageSearchQuery } from '../queries/build';
import { MessagesStubQueryResult } from '../queries/fragments';
import { parseMessageStubResult } from '../queries/parse';

export function isValidSearchQuery(input: string, allowAddress?: boolean) {
  if (!input) return false;
  if (isValidTransactionHash(input)) return true;
  if (allowAddress && isValidAddressFast(input)) return true;
  return false;
}

const AUTO_REFRESH_DELAY = 10000;
const LATEST_QUERY_LIMIT = 12;
const SEARCH_QUERY_LIMIT = 40;

export function useMessageQuery(
  sanitizedInput: string,
  originChainFilter: string | null,
  destinationChainFilter: string | null,
  startTimeFilter: number | null,
  endTimeFilter: number | null,
) {
  const hasInput = !!sanitizedInput;
  const isValidInput = hasInput ? isValidSearchQuery(sanitizedInput, true) : true;

  // Assemble GraphQL query
  const { query, variables } = buildMessageSearchQuery(
    sanitizedInput,
    originChainFilter,
    destinationChainFilter,
    startTimeFilter,
    endTimeFilter,
    hasInput ? SEARCH_QUERY_LIMIT : LATEST_QUERY_LIMIT,
    true,
  );

  // Execute query
  const [result, reexecuteQuery] = useQuery<MessagesStubQueryResult>({
    query,
    variables,
    pause: !isValidInput,
  });
  const { data, fetching: isFetching, error } = result;

  // Parse results
  const messageList = useMemo(() => parseMessageStubResult(data), [data]);

  // Setup interval to re-query
  const reExecutor = useCallback(() => {
    if (query && isValidInput) {
      reexecuteQuery({ requestPolicy: 'network-only' });
    }
  }, [reexecuteQuery, query, isValidInput]);
  useInterval(reExecutor, AUTO_REFRESH_DELAY);

  return {
    isValidInput,
    isFetching,
    isError: !!error,
    messageList,
  };
}
