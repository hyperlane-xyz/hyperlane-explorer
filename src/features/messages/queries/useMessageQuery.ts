import { useCallback, useMemo } from 'react';
import { useQuery } from 'urql';

import { useInterval } from '@hyperlane-xyz/widgets';

import { useMultiProvider } from '../../../store';
import { MessageStatus, MessageStatusFilter } from '../../../types';
import { useScrapedChains, useScrapedDomains } from '../../chains/queries/useScrapedChains';

import { MessageIdentifierType, buildMessageQuery, buildMessageSearchQuery } from './build';
import { searchValueToPostgresBytea } from './encoding';
import { MessagesQueryResult, MessagesStubQueryResult } from './fragments';
import { parseMessageQueryResult, parseMessageStubResult } from './parse';

const SEARCH_AUTO_REFRESH_DELAY = 15_000;
const MSG_AUTO_REFRESH_DELAY = 10_000;
const LATEST_QUERY_LIMIT = 100;
const SEARCH_QUERY_LIMIT = 50;

// Larger batch size for pending filter since most messages are delivered quickly,
// so we need to fetch more to find pending ones.
const PENDING_FILTER_BATCH_SIZE = 500;

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

  // Validating filters
  const isValidOrigin = !originChainNameFilter || originDomainId !== null;
  const isValidDestination = !destinationChainNameFilter || destDomainId !== null;

  const warpAddresses = warpRouteAddresses.map((a) => a.address);

  // For pending filter, we use client-side filtering because the DB query for
  // is_delivered=false is slow (no index on absence of delivered_message record).
  // Instead, we fetch more messages and filter client-side.
  const isPendingFilter = statusFilter === 'pending';
  const dbStatusFilter = isPendingFilter ? 'all' : statusFilter;

  // Use larger batch size for pending filter to find more pending messages
  const baseLimit = hasInput ? SEARCH_QUERY_LIMIT : LATEST_QUERY_LIMIT;
  const queryLimit = isPendingFilter ? PENDING_FILTER_BATCH_SIZE : baseLimit;

  const { query, variables } = buildMessageSearchQuery(
    sanitizedInput,
    isValidOrigin ? originDomainId : null,
    isValidDestination ? destDomainId : null,
    startTimeFilter,
    endTimeFilter,
    queryLimit,
    true,
    mainnetDomainIds,
    dbStatusFilter,
    warpAddresses,
    isPendingFilter,
  );

  // Execute query
  const [result, reexecuteQuery] = useQuery<MessagesStubQueryResult>({
    query,
    variables,
    pause: !isValidInput,
  });
  const { data, fetching: isFetching, error } = result;

  // Parse results
  const unfilteredMessageList = useMemo(
    () => parseMessageStubResult(multiProvider, scrapedChains, data),
    [multiProvider, scrapedChains, data],
  );

  // Apply client-side pending filter if needed
  const messageList = useMemo(() => {
    if (isPendingFilter) {
      return unfilteredMessageList.filter((m) => m.status === MessageStatus.Pending);
    }
    return unfilteredMessageList;
  }, [unfilteredMessageList, isPendingFilter]);

  const isMessagesFound = messageList.length > 0;

  // Auto-refresh query periodically
  const refresh = useCallback(() => {
    if (!query || !isValidInput || !isWindowVisible()) return;
    reexecuteQuery({ requestPolicy: 'network-only' });
  }, [reexecuteQuery, query, isValidInput]);
  useInterval(refresh, SEARCH_AUTO_REFRESH_DELAY);

  return {
    isValidInput,
    isValidOrigin,
    isValidDestination,
    isFetching,
    isError: !!error,
    hasRun: !!data,
    isMessagesFound,
    messageList,
    refetch: refresh,
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

/**
 * Hook to count messages in a given origin transaction.
 * Used to determine if we should show the "View all messages in this transaction" link.
 */
export function useTransactionMessageCount(originTxHash: string | undefined) {
  const { scrapedDomains: scrapedChains } = useScrapedDomains();
  const multiProvider = useMultiProvider();

  // Build query for origin tx hash
  const { query, variables } = useMemo(() => {
    if (!originTxHash) {
      // Return a no-op query
      return buildMessageQuery(
        MessageIdentifierType.OriginTxHash,
        '0x0000000000000000000000000000000000000000000000000000000000000000',
        1,
        true,
      );
    }
    return buildMessageQuery(MessageIdentifierType.OriginTxHash, originTxHash, 1000, true);
  }, [originTxHash]);

  // Execute query
  const [{ data }] = useQuery<MessagesStubQueryResult>({
    query,
    variables,
    pause: !originTxHash,
  });

  // Parse results
  const messageCount = useMemo(() => {
    if (!data || !originTxHash) return 0;
    const messages = parseMessageStubResult(multiProvider, scrapedChains, data);
    return messages.length;
  }, [data, multiProvider, scrapedChains, originTxHash]);

  return messageCount;
}

function isWindowVisible() {
  return document.visibilityState === 'visible';
}
