import { useRouter } from 'next/router';
import { useEffect, useRef, useState } from 'react';

import { Fade, IconButton, RefreshIcon, useDebounce } from '@hyperlane-xyz/widgets';

import { Card } from '../../components/layout/Card';
import { SearchBar } from '../../components/search/SearchBar';
import { SearchFilterBar } from '../../components/search/SearchFilterBar';
import {
  SearchChainError,
  SearchEmptyError,
  SearchFetching,
  SearchInvalidError,
  SearchRedirecting,
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

  // Query params from URL - isRouterReady indicates router has hydrated
  const [
    [
      defaultSearchQuery,
      defaultOriginQuery,
      defaultDestinationQuery,
      defaultStartTime,
      defaultEndTime,
    ],
    isRouterReady,
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

  // One-way sync: URL params → state on initial hydration only
  const hasHydratedRef = useRef(false);
  useEffect(() => {
    if (!isRouterReady || hasHydratedRef.current) return;
    hasHydratedRef.current = true;
    if (defaultSearchQuery) setSearchInput(defaultSearchQuery);
    if (defaultOriginQuery) setOriginChainFilter(defaultOriginQuery);
    if (defaultDestinationQuery) setDestinationChainFilter(defaultDestinationQuery);
    if (defaultStartTime) setStartTimeFilter(tryToDecimalNumber(defaultStartTime));
    if (defaultEndTime) setEndTimeFilter(tryToDecimalNumber(defaultEndTime));
  }, [
    isRouterReady,
    defaultSearchQuery,
    defaultOriginQuery,
    defaultDestinationQuery,
    defaultStartTime,
    defaultEndTime,
  ]);

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

  // Compute redirect URL for direct message/tx lookups
  const router = useRouter();
  const redirectUrl = (() => {
    // Wait for queries to complete
    if (!hasAllRun || isAnyFetching) return null;

    // Don't redirect without user input (prevents redirect on homepage with latest messages)
    if (!hasInput) return null;

    // Don't redirect if filters are applied
    if (originChainFilter || destinationChainFilter || startTimeFilter || endTimeFilter)
      return null;

    // Need at least one result
    if (!messageListResult.length) return null;

    const firstMessage = messageListResult[0];

    // Single result → always go to message page
    if (messageListResult.length === 1) {
      return `/message/${firstMessage.msgId}`;
    }

    // Multiple results + origin tx hash match → go to tx page
    // Only redirect if GraphQL found results (tx page uses GraphQL only, not PI)
    const inputLower = sanitizedInput.toLowerCase();
    if (isMessagesFound && firstMessage.origin?.hash?.toLowerCase() === inputLower) {
      return `/tx/${firstMessage.origin.hash}`;
    }

    return null;
  })();

  // Perform the redirect
  useEffect(() => {
    if (redirectUrl) {
      router.replace(redirectUrl);
    }
  }, [redirectUrl, router]);

  // Show message list if there are no errors and filters are valid
  const showMessageTable =
    !isAnyError &&
    isValidInput &&
    isValidOrigin &&
    isValidDestination &&
    isAnyMessageFound &&
    !!multiProvider;

  // Keep url in sync - use raw filter values, not validated ones, to preserve URL params
  // even when chain metadata hasn't loaded yet
  useSyncQueryParam({
    [MESSAGE_QUERY_PARAMS.SEARCH]: sanitizedInput,
    [MESSAGE_QUERY_PARAMS.ORIGIN]: originChainFilter || '',
    [MESSAGE_QUERY_PARAMS.DESTINATION]: destinationChainFilter || '',
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
            <RefreshButton loading={isAnyFetching} onClick={refetch} />
          </div>
        </div>
        <SearchRedirecting show={!!redirectUrl} />
        <Fade show={showMessageTable && !redirectUrl}>
          <MessageTable messageList={messageListResult} isFetching={isAnyFetching} />
        </Fade>
        <SearchFetching
          show={!redirectUrl && !isAnyError && isValidInput && !isAnyMessageFound && !hasAllRun}
          isPiFetching={isPiFetching}
        />
        <SearchEmptyError
          show={!redirectUrl && !isAnyError && isValidInput && !isAnyMessageFound && hasAllRun}
          hasInput={hasInput}
          allowAddress={true}
        />
        <SearchUnknownError show={!redirectUrl && isAnyError && isValidInput} />
        <SearchInvalidError show={!redirectUrl && !isValidInput} allowAddress={true} />
        <SearchChainError
          show={
            !redirectUrl &&
            (!isValidOrigin || !isValidDestination) &&
            isValidInput &&
            !!multiProvider
          }
        />
      </Card>
    </>
  );
}

function RefreshButton({ loading, onClick }: { loading: boolean; onClick: () => void }) {
  return (
    <IconButton onClick={onClick} className="rounded-lg bg-pink-500 p-1" disabled={loading}>
      <RefreshIcon color="white" height={20} width={20} />
    </IconButton>
  );
}
