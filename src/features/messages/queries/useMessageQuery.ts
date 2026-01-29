import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from 'urql';

import { useInterval } from '@hyperlane-xyz/widgets';

import { useMultiProvider } from '../../../store';
import { MessageStatus, MessageStatusFilter, MessageStub } from '../../../types';
import { useScrapedChains, useScrapedDomains } from '../../chains/queries/useScrapedChains';

import { MessageIdentifierType, buildMessageQuery, buildMessageSearchQuery } from './build';
import { searchValueToPostgresBytea } from './encoding';
import { MessagesQueryResult, MessagesStubQueryResult } from './fragments';
import { parseMessageQueryResult, parseMessageStubResult } from './parse';

const SEARCH_AUTO_REFRESH_DELAY = 15_000;
const MSG_AUTO_REFRESH_DELAY = 10_000;

// Batch sizes for progressive loading.
// Pending filter uses larger batches since most messages are delivered quickly,
// so we need to fetch more to find pending ones.
const PENDING_FILTER_BATCH_SIZE = 500;
const DEFAULT_BATCH_SIZE = 100;

export function isValidSearchQuery(input: string) {
  if (!input) return false;
  return !!searchValueToPostgresBytea(input);
}

export function useMessageSearchQuery(
  sanitizedInput: string,
  originChainNameFilter: string | null,
  destinationChainNameFilter: string | null,
  startTimeFilter: number | null,
  endTimeFilter: number | null,
  statusFilter: MessageStatusFilter = 'all',
  warpRouteAddresses: Array<{ chainName: string; address: string }> = [],
) {
  const { scrapedDomains: scrapedChains } = useScrapedDomains();
  const multiProvider = useMultiProvider();
  const { chains } = useScrapedChains(multiProvider);
  const mainnetDomainIds = Object.values(chains)
    .filter((chain) => !chain.isTestnet)
    .map((chain) => chain.domainId);

  const hasInput = !!sanitizedInput;
  const isValidInput = !hasInput || isValidSearchQuery(sanitizedInput);

  // Get chains domainId
  const originDomainId = originChainNameFilter
    ? multiProvider.tryGetDomainId(originChainNameFilter)
    : null;
  const destDomainId = destinationChainNameFilter
    ? multiProvider.tryGetDomainId(destinationChainNameFilter)
    : null;

  // validating filters
  const isValidOrigin = !originChainNameFilter || originDomainId !== null;
  const isValidDestination = !destinationChainNameFilter || destDomainId !== null;

  const warpAddresses = warpRouteAddresses.map((a) => a.address);

  // For pending filter, we use client-side filtering because the DB query for
  // is_delivered=false is slow (no index on absence of delivered_message record).
  // Instead, we fetch all messages and filter client-side.
  const isPendingFilter = statusFilter === 'pending';
  const dbStatusFilter = isPendingFilter ? 'all' : statusFilter;

  // Pagination state for progressive loading (used with pending filter)
  const [currentOffset, setCurrentOffset] = useState(0);
  const [accumulatedMessages, setAccumulatedMessages] = useState<MessageStub[]>([]);
  const [hasMorePages, setHasMorePages] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Reset pagination when any filter changes
  const filterKey = useMemo(
    () =>
      [
        sanitizedInput,
        originChainNameFilter,
        destinationChainNameFilter,
        startTimeFilter,
        endTimeFilter,
        statusFilter,
        warpAddresses.join(','),
      ].join('-'),
    [
      sanitizedInput,
      originChainNameFilter,
      destinationChainNameFilter,
      startTimeFilter,
      endTimeFilter,
      statusFilter,
      warpAddresses,
    ],
  );
  const prevFilterKeyRef = useRef(filterKey);

  useEffect(() => {
    if (prevFilterKeyRef.current !== filterKey) {
      setCurrentOffset(0);
      setAccumulatedMessages([]);
      setHasMorePages(true);
      setIsLoadingMore(false);
      prevFilterKeyRef.current = filterKey;
    }
  }, [filterKey]);

  const batchSize = isPendingFilter ? PENDING_FILTER_BATCH_SIZE : DEFAULT_BATCH_SIZE;

  const { query, variables } = buildMessageSearchQuery(
    sanitizedInput,
    isValidOrigin ? originDomainId : null,
    isValidDestination ? destDomainId : null,
    startTimeFilter,
    endTimeFilter,
    batchSize,
    true,
    mainnetDomainIds,
    dbStatusFilter,
    warpAddresses,
    currentOffset,
  );

  // Execute query
  const [result, reexecuteQuery] = useQuery<MessagesStubQueryResult>({
    query,
    variables,
    pause: !isValidInput,
  });
  const { data, fetching: isFetching, error } = result;

  // Accumulate messages across paginated requests
  useEffect(() => {
    if (!data) return;

    const currentBatch = parseMessageStubResult(multiProvider, scrapedChains, data);

    // Hide "Load More" only when API returns zero results (exhausted data)
    if (currentBatch.length === 0) {
      setHasMorePages(false);
    }

    if (currentOffset === 0) {
      setAccumulatedMessages(currentBatch);
    } else {
      // Append new messages, deduplicating by id
      setAccumulatedMessages((prev) => {
        const existingIds = new Set(prev.map((m) => m.id));
        const newMessages = currentBatch.filter((m) => !existingIds.has(m.id));
        return [...prev, ...newMessages];
      });
    }
    setIsLoadingMore(false);
  }, [data, currentOffset, multiProvider, scrapedChains]);

  const hasAnyFilter =
    !!originChainNameFilter ||
    !!destinationChainNameFilter ||
    !!startTimeFilter ||
    !!endTimeFilter ||
    statusFilter !== 'all' ||
    warpRouteAddresses.length > 0;

  const messageList = useMemo(() => {
    let result = accumulatedMessages;

    // Apply client-side pending filter
    if (isPendingFilter) {
      result = result.filter((m) => m.status === MessageStatus.Pending);
    }

    // For vanilla queries (no search, no filters), show only recent messages
    if (!hasInput && !hasAnyFilter) {
      const ONE_HOUR_MS = 60 * 60 * 1000;
      result = result.filter((m) => Date.now() - m.origin.timestamp < ONE_HOUR_MS).slice(0, 20);
    }

    return result;
  }, [hasInput, hasAnyFilter, accumulatedMessages, isPendingFilter]);

  const isMessagesFound = messageList.length > 0;

  // Load next page of results (for pending filter progressive loading)
  const loadMore = useCallback(() => {
    if (!hasMorePages || isFetching || isLoadingMore) return;
    setIsLoadingMore(true);
    setCurrentOffset((prev) => prev + batchSize);
  }, [hasMorePages, isFetching, isLoadingMore, batchSize]);

  // Auto-refresh query periodically (only first page to avoid confusion)
  const refresh = useCallback(() => {
    if (!query || !isValidInput || !isWindowVisible()) return;
    if (currentOffset > 0) return;
    reexecuteQuery({ requestPolicy: 'network-only' });
  }, [reexecuteQuery, query, isValidInput, currentOffset]);
  useInterval(refresh, SEARCH_AUTO_REFRESH_DELAY);

  return {
    isValidInput,
    isValidOrigin,
    isValidDestination,
    isFetching: isFetching || isLoadingMore,
    isError: !!error,
    hasRun: !!data,
    isMessagesFound,
    messageList,
    refetch: refresh,
    // Progressive loading for pending filter
    loadMore,
    hasMore: hasMorePages,
    isLoadingMore,
  };
}

export function useMessageQuery({ messageId, pause }: { messageId: string; pause: boolean }) {
  const { scrapedDomains: scrapedChains } = useScrapedDomains();

  // Assemble GraphQL Query
  const { query, variables } = buildMessageQuery(MessageIdentifierType.Id, messageId, 1);

  // Execute query
  const [{ data, fetching: isFetching, error }, reexecuteQuery] = useQuery<MessagesQueryResult>({
    query,
    variables,
    pause,
  });

  // Parse results
  const multiProvider = useMultiProvider();
  const messageList = useMemo(
    () => parseMessageQueryResult(multiProvider, scrapedChains, data),
    [multiProvider, scrapedChains, data],
  );
  const isMessageFound = messageList.length > 0;
  const message = isMessageFound ? messageList[0] : null;
  const msgStatus = message?.status;
  const isDelivered = isMessageFound && msgStatus === MessageStatus.Delivered;

  // Setup interval to re-query
  const reExecutor = useCallback(() => {
    if (pause || isDelivered || !isWindowVisible()) return;
    reexecuteQuery({ requestPolicy: 'network-only' });
  }, [pause, isDelivered, reexecuteQuery]);
  useInterval(reExecutor, MSG_AUTO_REFRESH_DELAY);

  return {
    isFetching,
    isError: !!error,
    hasRun: !!data,
    isMessageFound,
    message,
  };
}

function isWindowVisible() {
  return document.visibilityState === 'visible';
}
