import { useRouter } from 'next/router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from 'urql';

import { Fade } from '../../components/animation/Fade';
import { SearchBar } from '../../components/search/SearchBar';
import {
  SearchEmptyError,
  SearchInvalidError,
  SearchUnknownError,
} from '../../components/search/SearchError';
import { SearchFilterBar } from '../../components/search/SearchFilterBar';
import { chainToDomain } from '../../consts/domains';
import { trimLeading0x } from '../../utils/addresses';
import useDebounce from '../../utils/debounce';
import { logger } from '../../utils/logger';
import { getQueryParamString } from '../../utils/queryParams';
import { sanitizeString } from '../../utils/string';
import { useInterval } from '../../utils/timeout';

import { MessageTable } from './MessageTable';
import { parseMessageStubResult } from './query';
import { MessagesStubQueryResult } from './types';
import { isValidSearchQuery } from './utils';

const AUTO_REFRESH_DELAY = 10000;
const LATEST_QUERY_LIMIT = 12;
const SEARCH_QUERY_LIMIT = 40;
const QUERY_SEARCH_PARAM = 'search';

export function MessageSearch() {
  const router = useRouter();

  // Search text input
  const defaultSearchQuery = getQueryParamString(router.query, QUERY_SEARCH_PARAM);
  const [searchInput, setSearchInput] = useState(defaultSearchQuery);
  const debouncedSearchInput = useDebounce(searchInput, 750);
  const hasInput = !!debouncedSearchInput;
  const sanitizedInput = sanitizeString(debouncedSearchInput);
  const isValidInput = hasInput ? isValidSearchQuery(sanitizedInput, true) : true;

  // Keep search input in sync with url
  useEffect(() => {
    const path = isValidInput && sanitizedInput ? `/?${QUERY_SEARCH_PARAM}=${sanitizedInput}` : '/';
    router
      .replace(path, undefined, { shallow: true })
      .catch((e) => logger.error('Error shallow updating url', e));
    // Must exclude router for next.js shallow routing, otherwise links break:
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isValidInput, sanitizedInput]);

  // Filter state and handlers
  const [originChainFilter, setOriginChainFilter] = useState('');
  const [destinationChainFilter, setDestinationChainFilter] = useState('');
  const onChangeOriginFilter = (value: string) => {
    setOriginChainFilter(value);
  };
  const onChangeDestinationFilter = (value: string) => {
    setDestinationChainFilter(value);
  };

  // GraphQL query and results
  const { query, variables } = assembleQuery(
    sanitizedInput,
    originChainFilter,
    destinationChainFilter,
  );
  const [result, reexecuteQuery] = useQuery<MessagesStubQueryResult>({
    query,
    variables,
    pause: !isValidInput,
  });
  const { data, fetching: isFetching, error } = result;
  const messageList = useMemo(() => parseMessageStubResult(data), [data]);
  const hasError = !!error;
  const reExecutor = useCallback(() => {
    if (query && isValidInput) {
      reexecuteQuery({ requestPolicy: 'network-only' });
    }
  }, [reexecuteQuery, query, isValidInput]);
  useInterval(reExecutor, AUTO_REFRESH_DELAY);

  return (
    <>
      <SearchBar
        value={searchInput}
        onChangeValue={setSearchInput}
        isFetching={isFetching}
        placeholder="Search by address or transaction hash"
      />
      <div className="w-full min-h-[38rem] mt-5 bg-white shadow-md border border-blue-50 rounded overflow-auto relative">
        <div className="px-2 py-3 sm:px-4 md:px-5 flex items-center justify-between">
          <h2 className="pl-0.5 text-gray-700">
            {!hasInput ? 'Latest Messages' : 'Search Results'}
          </h2>
          <SearchFilterBar
            originChainFilter={originChainFilter}
            onChangeOriginFilter={onChangeOriginFilter}
            destinationChainFilter={destinationChainFilter}
            onChangeDestinationFilter={onChangeDestinationFilter}
          />
        </div>
        <Fade show={!hasError && isValidInput && messageList.length > 0}>
          <MessageTable messageList={messageList} isFetching={isFetching} />
        </Fade>

        <SearchInvalidError show={!isValidInput} allowAddress={true} />
        <SearchUnknownError show={isValidInput && hasError} />
        <SearchEmptyError
          show={isValidInput && !hasError && !isFetching && messageList.length === 0}
          hasInput={hasInput}
          allowAddress={true}
        />
      </div>
    </>
  );
}

function assembleQuery(searchInput: string, originFilter: string, destFilter: string) {
  const hasInput = !!searchInput;
  const variables = {
    search: hasInput ? trimLeading0x(searchInput) : undefined,
    originChain: originFilter ? chainToDomain[originFilter] : undefined,
    destinationChain: destFilter ? chainToDomain[destFilter] : undefined,
  };
  const limit = hasInput ? SEARCH_QUERY_LIMIT : LATEST_QUERY_LIMIT;

  const query = `
  query ($search: String, $originChain: Int, $destinationChain: Int) {
    message(
      where: {
        _and: [
          ${originFilter ? '{origin: {_eq: $originChain}},' : ''}
          ${destFilter ? '{destination: {_eq: $destinationChain}},' : ''}
          ${hasInput ? searchWhereClause : ''}
        ]
      },
      order_by: {timestamp: desc},
      limit: ${limit}
      ) {
        ${messageStubProps}
      }
  }
  `;
  return { query, variables };
}

const searchWhereClause = `
  {_or: [
    {sender: {_eq: $search}},
    {recipient: {_eq: $search}},
    {transaction: {hash: {_eq: $search}}},
    {transaction: {sender: {_eq: $search}}},
    {delivered_message: {transaction: {hash: {_eq: $search}}}},
    {delivered_message: {transaction: {sender: {_eq: $search}}}}
  ]}
`;

const messageStubProps = `
  id
  destination
  origin
  recipient
  sender
  timestamp
  delivered_message {
    id
    tx_id
    inbox_address
    transaction {
      block {
        timestamp
      }
    }
  }
  message_states {
    block_height
    block_timestamp
    error_msg
    estimated_gas_cost
    id
    processable
  }
`;
