import { useState } from 'react';

import { Fade } from '../../components/animation/Fade';
import { SearchBar } from '../../components/search/SearchBar';
import {
  SearchEmptyError,
  SearchInvalidError,
  SearchUnknownError,
} from '../../components/search/SearchError';
import { SearchFilterBar } from '../../components/search/SearchFilterBar';
import useDebounce from '../../utils/debounce';
import { useQueryParam, useSyncQueryParam } from '../../utils/queryParams';
import { sanitizeString } from '../../utils/string';

import { MessageTable } from './MessageTable';
import { useMessageQuery } from './queries/useMessageQuery';
import { usePiChainMessageQuery } from './queries/usePiChainMessageQuery';

const QUERY_SEARCH_PARAM = 'search';

export function MessageSearch() {
  // Search text input
  const defaultSearchQuery = useQueryParam(QUERY_SEARCH_PARAM);
  const [searchInput, setSearchInput] = useState(defaultSearchQuery);
  const debouncedSearchInput = useDebounce(searchInput, 750);
  const hasInput = !!debouncedSearchInput;
  const sanitizedInput = sanitizeString(debouncedSearchInput);

  // Filter state
  const [originChainFilter, setOriginChainFilter] = useState<string | null>(null);
  const [destinationChainFilter, setDestinationChainFilter] = useState<string | null>(null);
  const [startTimeFilter, setStartTimeFilter] = useState<number | null>(null);
  const [endTimeFilter, setEndTimeFilter] = useState<number | null>(null);

  // GraphQL query and results
  const { isValidInput, isError, isFetching, messageList } = useMessageQuery(
    sanitizedInput,
    originChainFilter,
    destinationChainFilter,
    startTimeFilter,
    endTimeFilter,
  );
  const isMessagesFound = messageList.length > 0;

  // Permissionless Interop query and results
  const {
    isError: isPiError,
    isFetching: isPiFetching,
    messageList: piMessageList,
  } = usePiChainMessageQuery(
    sanitizedInput,
    startTimeFilter,
    endTimeFilter,
    isMessagesFound || isFetching,
  );

  const isAnyMessageFound = isMessagesFound || piMessageList.length > 0;
  const messageListResult = isMessagesFound ? messageList : piMessageList;
  console.log(isPiError, isPiFetching, piMessageList);

  // Keep url in sync
  useSyncQueryParam(QUERY_SEARCH_PARAM, isValidInput ? sanitizedInput : '');

  return (
    <>
      <SearchBar
        value={searchInput}
        onChangeValue={setSearchInput}
        isFetching={isFetching}
        placeholder="Search by address, hash, or message id"
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
        <Fade show={!isError && isValidInput && isAnyMessageFound}>
          <MessageTable messageList={messageListResult} isFetching={isFetching} />
        </Fade>
        <SearchEmptyError
          show={!isError && isValidInput && !isFetching && !isAnyMessageFound}
          hasInput={hasInput}
          allowAddress={true}
        />
        <SearchUnknownError show={isError && isValidInput} />
        <SearchInvalidError show={!isValidInput} allowAddress={true} />
      </div>
    </>
  );
}
