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
import useDebounce from '../../utils/debounce';
import { logger } from '../../utils/logger';
import { getQueryParamString } from '../../utils/queryParams';
import { sanitizeString } from '../../utils/string';
import { useInterval } from '../../utils/useInterval';

import { MessageTable } from './MessageTable';
import { buildMessageSearchQuery } from './queries/build';
import { MessagesStubQueryResult } from './queries/fragments';
import { parseMessageStubResult } from './queries/parse';
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

  // Filter state
  const [originChainFilter, setOriginChainFilter] = useState<string | null>(null);
  const [destinationChainFilter, setDestinationChainFilter] = useState<string | null>(null);
  const [startTimeFilter, setStartTimeFilter] = useState<number | null>(null);
  const [endTimeFilter, setEndTimeFilter] = useState<number | null>(null);

  // GraphQL query and results
  const { query, variables } = buildMessageSearchQuery(
    sanitizedInput,
    originChainFilter,
    destinationChainFilter,
    startTimeFilter,
    endTimeFilter,
    hasInput ? SEARCH_QUERY_LIMIT : LATEST_QUERY_LIMIT,
    true,
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
      <div className="w-full min-h-[38rem] mt-5 bg-white shadow-md border rounded overflow-auto relative">
        <div className="px-2 py-3 sm:px-4 md:px-5 flex items-center justify-between">
          <h2 className="w-min sm:w-fit pl-0.5 text-gray-700">
            {!hasInput ? 'Latest Messages' : 'Search Results'}
          </h2>
          <SearchFilterBar
            originChain={originChainFilter}
            onChangeOrigin={setOriginChainFilter}
            destinationChain={destinationChainFilter}
            onChangeDestination={setDestinationChainFilter}
            startTimestamp={startTimeFilter}
            onChangeStartTimestamp={setStartTimeFilter}
            endTimestamp={endTimeFilter}
            onChangeEndTimestamp={setEndTimeFilter}
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
