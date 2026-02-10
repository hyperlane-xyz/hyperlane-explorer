import { useRouter } from 'next/router';
import { useEffect, useMemo, useRef, useState } from 'react';

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
import { useReadyMultiProvider, useWarpRouteIdToAddressesMap } from '../../store';
import { MessageStatusFilter, WarpRouteIdToAddressesMap } from '../../types';
import { tryToDecimalNumber } from '../../utils/number';
import { useMultipleQueryParams, useSyncQueryParam } from '../../utils/queryParams';
import { isWarpRouteIdFormat, sanitizeString } from '../../utils/string';

import { MessageTable } from './MessageTable';
import { usePiChainMessageSearchQuery } from './pi-queries/usePiChainMessageQuery';
import { useMessageSearchQuery } from './queries/useMessageQuery';

function parseStatusFilter(value: string): MessageStatusFilter {
  if (value === 'delivered' || value === 'pending') return value;
  return 'all';
}

// Check if the input matches a known warp route ID (case-insensitive)
function findMatchingWarpRouteId(
  input: string,
  warpRouteIdToAddressesMap: WarpRouteIdToAddressesMap,
): string | null {
  const inputLower = input.trim().toLowerCase();
  if (warpRouteIdToAddressesMap[inputLower]) {
    return inputLower;
  }
  return null;
}

enum MESSAGE_QUERY_PARAMS {
  SEARCH = 'search',
  ORIGIN = 'origin',
  DESTINATION = 'destination',
  START_TIME = 'startTime',
  END_TIME = 'endTime',
  STATUS = 'status',
}

export function MessageSearch() {
  // Chain metadata
  const multiProvider = useReadyMultiProvider();
  const warpRouteIdToAddressesMap = useWarpRouteIdToAddressesMap();

  // Query params from URL - isRouterReady indicates router has hydrated
  const [
    [
      defaultSearchQuery,
      defaultOriginQuery,
      defaultDestinationQuery,
      defaultStartTime,
      defaultEndTime,
      defaultStatus,
    ],
    isRouterReady,
  ] = useMultipleQueryParams([
    MESSAGE_QUERY_PARAMS.SEARCH,
    MESSAGE_QUERY_PARAMS.ORIGIN,
    MESSAGE_QUERY_PARAMS.DESTINATION,
    MESSAGE_QUERY_PARAMS.START_TIME,
    MESSAGE_QUERY_PARAMS.END_TIME,
    MESSAGE_QUERY_PARAMS.STATUS,
  ]);

  // Search text input
  const [searchInput, setSearchInput] = useState(defaultSearchQuery);
  const debouncedSearchInput = useDebounce(searchInput, 750);
  const trimmedInput = debouncedSearchInput.trim();
  const hasInput = !!trimmedInput;

  // Check if the search input is a warp route ID (check BEFORE sanitizing since "/" gets removed)
  const detectedWarpRouteId = useMemo(() => {
    if (!trimmedInput || !isWarpRouteIdFormat(trimmedInput)) return null;
    return findMatchingWarpRouteId(trimmedInput, warpRouteIdToAddressesMap);
  }, [trimmedInput, warpRouteIdToAddressesMap]);

  // Get warp route addresses if search input is a warp route ID
  const warpRouteAddresses = useMemo(() => {
    if (!detectedWarpRouteId) return [];
    return warpRouteIdToAddressesMap[detectedWarpRouteId] || [];
  }, [detectedWarpRouteId, warpRouteIdToAddressesMap]);

  // Sanitize input for non-warp-route queries (removes special chars like "/")
  const sanitizedInput = detectedWarpRouteId ? '' : sanitizeString(debouncedSearchInput);

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
  const [statusFilter, setStatusFilter] = useState<MessageStatusFilter>(
    parseStatusFilter(defaultStatus),
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
    if (defaultStatus) setStatusFilter(parseStatusFilter(defaultStatus));
  }, [
    isRouterReady,
    defaultSearchQuery,
    defaultOriginQuery,
    defaultDestinationQuery,
    defaultStartTime,
    defaultEndTime,
    defaultStatus,
  ]);

  // Check if input looks like a warp route format (use trimmedInput, not sanitizedInput)
  const looksLikeWarpRoute = isWarpRouteIdFormat(trimmedInput);
  const isWarpRouteMapLoaded = Object.keys(warpRouteIdToAddressesMap).length > 0;

  // For warp route searches, don't pass search input to normal query (we use addresses instead)
  // If it looks like a warp route but we haven't loaded the map yet, pass empty to avoid invalid error
  const searchInputForQuery =
    detectedWarpRouteId || (looksLikeWarpRoute && !isWarpRouteMapLoaded) ? '' : sanitizedInput;

  // Check if search input looks like a warp route but wasn't found (after map is loaded)
  const isUnknownWarpRoute = looksLikeWarpRoute && isWarpRouteMapLoaded && !detectedWarpRouteId;

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
    searchInputForQuery,
    originChainFilter,
    destinationChainFilter,
    startTimeFilter,
    endTimeFilter,
    statusFilter,
    warpRouteAddresses,
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
  // For warp routes, preserve the original input with "/" instead of sanitized version
  useSyncQueryParam({
    [MESSAGE_QUERY_PARAMS.SEARCH]:
      detectedWarpRouteId || looksLikeWarpRoute ? trimmedInput : sanitizedInput,
    [MESSAGE_QUERY_PARAMS.ORIGIN]: originChainFilter || '',
    [MESSAGE_QUERY_PARAMS.DESTINATION]: destinationChainFilter || '',
    [MESSAGE_QUERY_PARAMS.START_TIME]: startTimeFilter !== null ? String(startTimeFilter) : '',
    [MESSAGE_QUERY_PARAMS.END_TIME]: endTimeFilter !== null ? String(endTimeFilter) : '',
    [MESSAGE_QUERY_PARAMS.STATUS]: statusFilter !== 'all' ? statusFilter : '',
  });

  return (
    <>
      <SearchBar
        value={searchInput}
        onChangeValue={setSearchInput}
        isFetching={isAnyFetching}
        placeholder="Search by address, hash, message id, or warp route"
      />
      <Card className="relative mt-4 min-h-[38rem] w-full" padding="">
        <div className="flex items-center justify-between px-2 pb-3 pt-3.5 sm:px-4 md:px-5">
          <h2 className="w-min pl-0.5 font-medium text-primary-800 sm:w-fit">
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
              statusFilter={statusFilter}
              onChangeStatus={setStatusFilter}
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
        <SearchInvalidError
          show={!redirectUrl && !isValidInput && !detectedWarpRouteId && !looksLikeWarpRoute}
          allowAddress={true}
        />
        {looksLikeWarpRoute && !isWarpRouteMapLoaded && (
          <div className="absolute left-0 right-0 top-10">
            <div className="my-10 flex justify-center">
              <div className="flex max-w-md flex-col items-center justify-center px-3 py-5 text-center">
                <div className="text-gray-700">Loading warp route data...</div>
              </div>
            </div>
          </div>
        )}
        {isUnknownWarpRoute && (
          <div className="absolute left-0 right-0 top-10">
            <div className="my-10 flex justify-center">
              <div className="flex max-w-md flex-col items-center justify-center px-3 py-5 text-center">
                <div className="text-gray-700">
                  Warp route &quot;{trimmedInput}&quot; not found. Please check the route ID.
                </div>
              </div>
            </div>
          </div>
        )}
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
    <IconButton
      onClick={onClick}
      className="flex h-[30px] w-[30px] items-center justify-center rounded bg-accent-600 duration-500 hover:bg-accent-700"
      disabled={loading}
    >
      <RefreshIcon color="white" height={18} width={18} />
    </IconButton>
  );
}
