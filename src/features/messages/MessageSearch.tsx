import { useEffect, useMemo, useRef, useState } from 'react';

import { Fade, IconButton, RefreshIcon, useDebounce } from '@hyperlane-xyz/widgets';
import dynamic from 'next/dynamic';

import { Card } from '../../components/layout/Card';
import { SearchBar } from '../../components/search/SearchBar';
import {
  SearchChainError,
  SearchEmptyError,
  SearchFetching,
  SearchInvalidError,
  SearchUnknownError,
} from '../../components/search/SearchStates';
import { useReadyMultiProvider, useStore, useWarpRouteIdToAddressesMap } from '../../store';
import { MessageStatusFilter, WarpRouteIdToAddressesMap } from '../../types';
import { logger } from '../../utils/logger';
import { tryToDecimalNumber } from '../../utils/number';
import { useMultipleQueryParams, useSyncQueryParam } from '../../utils/queryParams';
import { isWarpRouteIdFormat, sanitizeString } from '../../utils/string';

import { MessageTable } from './MessageTable';
import { usePiChainMessageSearchQuery } from './pi-queries/usePiChainMessageQuery';
import { useMessageSearchQuery } from './queries/useMessageQuery';

const SearchFilterBar = dynamic(
  () => import('../../components/search/SearchFilterBar').then((mod) => mod.SearchFilterBar),
  { loading: () => <SearchFilterBarSkeleton /> },
);

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
  const ensureWarpRouteData = useStore((s) => s.ensureWarpRouteData);

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

  useEffect(() => {
    if (isWarpRouteMapLoaded) return;

    const loadWarpRouteData = () => {
      ensureWarpRouteData().catch((e) => logger.error('Error loading warp route data', e));
    };

    if (looksLikeWarpRoute) {
      loadWarpRouteData();
      return;
    }

    if (typeof window === 'undefined') return;

    if ('requestIdleCallback' in window) {
      const idleWindow = window as Window &
        typeof globalThis & {
          requestIdleCallback: typeof window.requestIdleCallback;
          cancelIdleCallback: typeof window.cancelIdleCallback;
        };
      const idleId = idleWindow.requestIdleCallback(loadWarpRouteData, { timeout: 2_000 });
      return () => idleWindow.cancelIdleCallback(idleId);
    }

    const timeoutId = globalThis.setTimeout(loadWarpRouteData, 1_500);
    return () => globalThis.clearTimeout(timeoutId);
  }, [ensureWarpRouteData, isWarpRouteMapLoaded, looksLikeWarpRoute]);

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
        <SearchInvalidError
          show={!isValidInput && !detectedWarpRouteId && !looksLikeWarpRoute}
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
          show={(!isValidOrigin || !isValidDestination) && isValidInput && !!multiProvider}
        />
      </Card>
    </>
  );
}

function SearchFilterBarSkeleton() {
  return (
    <div className="flex items-center gap-2 md:gap-4">
      <div className="h-8 w-20 rounded border border-accent-600/40 bg-accent-50/40" />
      <div className="h-8 w-24 rounded border border-accent-600/40 bg-accent-50/40" />
      <div className="h-8 w-16 rounded border border-accent-600/40 bg-accent-50/40" />
      <div className="h-8 w-20 rounded border border-accent-600/40 bg-accent-50/40" />
    </div>
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
