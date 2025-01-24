import { useState } from 'react';

import { Fade, IconButton, RefreshIcon, SpinnerIcon, useDebounce } from '@hyperlane-xyz/widgets';

import { Card } from '../../components/layout/Card';
import { SearchBar } from '../../components/search/SearchBar';
import { SearchFilterBar } from '../../components/search/SearchFilterBar';
import {
  SearchChainError,
  SearchEmptyError,
  SearchFetching,
  SearchInvalidError,
  SearchUnknownError,
} from '../../components/search/SearchStates';
import { useReadyMultiProvider } from '../../store';
import { useMultipleQueryParams, useSyncQueryParam } from '../../utils/queryParams';
import { sanitizeString } from '../../utils/string';

import { tryToDecimalNumber } from '../../utils/number';
import { MessageTable } from './MessageTable';
import { usePiChainMessageSearchQuery } from './pi-queries/usePiChainMessageQuery';
import { useMessageSearchQuery } from './queries/useMessageQuery';

enum MESSAGE_QUERY_PARAMS {
  SEARCH = 'search',
  ORIGIN = 'origin',
  DESTINATION = 'destination',
  START_TIME = 'startTime',
  END_TIME = 'endTime',
}

export function MessageSearch() {
  // Chain metadata
  const multiProvider = useReadyMultiProvider();

  // query params
  const [
    defaultSearchQuery,
    defaultOriginQuery,
    defaultDestinationQuery,
    defaultStartTime,
    defaultEndTime,
  ] = useMultipleQueryParams([
    MESSAGE_QUERY_PARAMS.SEARCH,
    MESSAGE_QUERY_PARAMS.ORIGIN,
    MESSAGE_QUERY_PARAMS.DESTINATION,
    MESSAGE_QUERY_PARAMS.START_TIME,
    MESSAGE_QUERY_PARAMS.END_TIME,
  ]);

  // Search text input
  const [searchInput, setSearchInput] = useState(defaultSearchQuery);
  const debouncedSearchInput = useDebounce(searchInput, 750);
  const hasInput = !!debouncedSearchInput;
  const sanitizedInput = sanitizeString(debouncedSearchInput);

  // Filter state
  const [originChainFilter, setOriginChainFilter] = useState<string | null>(
    defaultOriginQuery || null,
  );
  const [destinationChainFilter, setDestinationChainFilter] = useState<string | null>(
    defaultDestinationQuery || null,
  );
  const [startTimeFilter, setStartTimeFilter] = useState<number | null>(
    tryToDecimalNumber(defaultStartTime),
  );
  const [endTimeFilter, setEndTimeFilter] = useState<number | null>(
    tryToDecimalNumber(defaultEndTime),
  );

  // GraphQL query and results
  const {
    isValidInput,
    isValidOrigin,
    isValidDestination,
    isError,
    isFetching,
    hasRun,
    messageList,
    isMessagesFound,
    refetch,
  } = useMessageSearchQuery(
    sanitizedInput,
    originChainFilter,
    destinationChainFilter,
    startTimeFilter,
    endTimeFilter,
  );

  // Run permissionless interop chains query if needed
  const {
    isError: isPiError,
    isFetching: isPiFetching,
    hasRun: hasPiRun,
    messageList: piMessageList,
    isMessagesFound: isPiMessagesFound,
  } = usePiChainMessageSearchQuery({
    sanitizedInput,
    startTimeFilter,
    endTimeFilter,
    pause: !hasRun || isMessagesFound,
  });

  // Coalesce GraphQL + PI results
  const isAnyFetching = isFetching || isPiFetching;
  const isAnyError = isError || isPiError;
  const hasAllRun = hasRun && hasPiRun;
  const isAnyMessageFound = isMessagesFound || isPiMessagesFound;
  const messageListResult = isMessagesFound ? messageList : piMessageList;

  // Show message list if there are no errors and filters are valid
  const showMessageTable =
    !isAnyError &&
    isValidInput &&
    isValidOrigin &&
    isValidDestination &&
    isAnyMessageFound &&
    !!multiProvider;

  // Keep url in sync
  useSyncQueryParam({
    [MESSAGE_QUERY_PARAMS.SEARCH]: isValidInput ? sanitizedInput : '',
    [MESSAGE_QUERY_PARAMS.ORIGIN]: (isValidOrigin && originChainFilter) || '',
    [MESSAGE_QUERY_PARAMS.DESTINATION]: (isValidDestination && destinationChainFilter) || '',
    [MESSAGE_QUERY_PARAMS.START_TIME]: startTimeFilter !== null ? String(startTimeFilter) : '',
    [MESSAGE_QUERY_PARAMS.END_TIME]: endTimeFilter !== null ? String(endTimeFilter) : '',
  });

  return (
    <>
      <SearchBar
        value={searchInput}
        onChangeValue={setSearchInput}
        isFetching={isAnyFetching}
        placeholder="Search by address, hash, or message id"
      />
      <Card className="relative mt-4 min-h-[38rem] w-full" padding="">
        <div className="flex items-center justify-between px-2 pb-3 pt-3.5 sm:px-4 md:px-5">
          <h2 className="w-min pl-0.5 font-medium text-blue-500 sm:w-fit">
            {!hasInput ? 'Latest Messages' : 'Search Results'}
          </h2>
          <div className="flex items-center space-x-2 md:space-x-4">
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
            <IconButton
              onClick={refetch}
              className="h-7 w-7 rounded-lg bg-pink-500"
              disabled={isAnyFetching}
            >
              {isAnyFetching ? (
                <SpinnerIcon color="white" height={16} width={16} />
              ) : (
                <RefreshIcon color="white" height={20} width={20} />
              )}
            </IconButton>
          </div>
        </div>
        <Fade show={showMessageTable}>
          <MessageTable messageList={messageListResult} isFetching={isAnyFetching} />
        </Fade>
        <SearchFetching
          show={!isAnyError && isValidInput && !isAnyMessageFound && !hasAllRun}
          isPiFetching={isPiFetching}
        />
        <SearchEmptyError
          show={!isAnyError && isValidInput && !isAnyMessageFound && hasAllRun}
          hasInput={hasInput}
          allowAddress={true}
        />
        <SearchUnknownError show={isAnyError && isValidInput} />
        <SearchInvalidError show={!isValidInput} allowAddress={true} />
        <SearchChainError show={(!isValidOrigin || !isValidDestination) && isValidInput} />
      </Card>
    </>
  );
}
