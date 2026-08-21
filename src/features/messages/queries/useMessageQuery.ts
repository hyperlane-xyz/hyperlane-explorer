import { eqAddress, isAddress } from '@hyperlane-xyz/utils';
import { useCallback, useMemo } from 'react';
import { useQuery } from 'urql';

import { useChainMetadataResolver } from '../../../metadataStore';
import { MessageStatus, MessageStatusFilter, MessageStub } from '../../../types';
import { logger } from '../../../utils/logger';
import { adjustToUtcTime } from '../../../utils/time';
import { useVisibleInterval } from '../../../utils/useVisibleInterval';
import { useScrapedChains, useScrapedDomains } from '../../chains/queries/useScrapedChains';
import { MessageIdentifierType, buildMessageQuery, buildMessageSearchQuery } from './build';
import { isPotentiallyTransactionHash, searchValueToPostgresBytea } from './encoding';
import { MessagesQueryResult, MessagesStubQueryResult } from './fragments';
import {
  parseMessageEntry,
  parseMessageQueryResult,
  parseMessageStubEntry,
  parseMessageStubResult,
} from './parse';
import {
  type ExplorerConnectionState,
  useExplorerConnectionState,
  useLatestMessageRows,
  useMessageRowSubscription,
} from './useLiveMessages';

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

export function getSearchMetadataState(
  scrapedDomainCount: number,
  mainnetDomainCount: number,
  isFetching: boolean,
  isError: boolean,
) {
  const isReady = scrapedDomainCount > 0 && mainnetDomainCount > 0;
  return {
    isReady,
    isError: isError || (!isFetching && scrapedDomainCount === 0),
  };
}

export function shouldUseMessageQueryCache(connectionState: ExplorerConnectionState) {
  return connectionState !== 'connected';
}

// A message belongs to the warp route if it was sent from the route's token on
// the origin chain or received by it on the destination chain. eqAddress is
// protocol-aware so this stays correct across EVM/Sealevel/Cosmos/etc.
export function messageMatchesWarpRoute(
  message: MessageStub,
  warpRouteDomainAddresses: Array<{ domainId: number; address: string }>,
): boolean {
  return warpRouteDomainAddresses.some(
    ({ domainId, address }) =>
      (message.originDomainId === domainId && eqAddress(message.sender, address)) ||
      (message.destinationDomainId === domainId && eqAddress(message.recipient, address)),
  );
}

interface MessageSearchFilters {
  searchInput: string;
  originDomainId: number | null;
  destinationDomainId: number | null;
  startTime: number | null;
  endTime: number | null;
  status: MessageStatusFilter;
}

export function messageMatchesSearchFilters(
  message: MessageStub,
  filters: MessageSearchFilters,
): boolean {
  if (filters.searchInput && !messageMatchesSearchInput(message, filters.searchInput)) return false;
  if (filters.originDomainId && message.originDomainId !== filters.originDomainId) return false;
  if (filters.destinationDomainId && message.destinationDomainId !== filters.destinationDomainId) {
    return false;
  }

  const startTime = filters.startTime ? Date.parse(adjustToUtcTime(filters.startTime)) : null;
  const endTime = filters.endTime ? Date.parse(adjustToUtcTime(filters.endTime)) : null;
  if (startTime && message.origin.timestamp < startTime) return false;
  if (endTime && message.origin.timestamp > endTime) return false;
  if (filters.status === 'delivered' && message.status !== MessageStatus.Delivered) return false;
  if (filters.status === 'pending' && message.status !== MessageStatus.Pending) return false;
  return true;
}

function messageMatchesSearchInput(message: MessageStub, searchInput: string): boolean {
  const identifier = normalizeIdentifier(searchInput);
  if (normalizeIdentifier(message.msgId) === identifier) return true;
  if (
    isAddress(searchInput) &&
    [message.sender, message.recipient, message.origin.from, message.destination?.from].some(
      (address) => address && eqAddress(address, searchInput),
    )
  ) {
    return true;
  }
  return (
    isPotentiallyTransactionHash(searchInput) &&
    [message.origin.hash, message.destination?.hash].some(
      (hash) => hash && normalizeIdentifier(hash) === identifier,
    )
  );
}

function normalizeIdentifier(value: string) {
  return /^(?:0x)?[0-9a-f]+$/i.test(value) ? value.replace(/^0x/i, '').toLowerCase() : value;
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
  const {
    scrapedDomains: scrapedChains,
    isFetching: isScrapedDomainsFetching,
    isError: isScrapedDomainsError,
  } = useScrapedDomains();
  const chainMetadataResolver = useChainMetadataResolver();
  const { chains, isError: isScrapedChainsError } = useScrapedChains(chainMetadataResolver);
  const explorerConnectionState = useExplorerConnectionState();
  const mainnetDomainIds = useMemo(
    () =>
      Object.values(chains)
        .filter((chain) => !chain.isTestnet)
        .map((chain) => chain.domainId),
    [chains],
  );
  const { isReady: isSearchMetadataReady, isError: isSearchMetadataError } = getSearchMetadataState(
    scrapedChains.length,
    mainnetDomainIds.length,
    isScrapedDomainsFetching,
    isScrapedDomainsError || isScrapedChainsError,
  );

  const hasInput = !!sanitizedInput;
  const isValidInput = !hasInput || isValidSearchQuery(sanitizedInput);

  // Get chains domainId
  const originDomainId = originChainNameFilter
    ? chainMetadataResolver.tryGetDomainId(originChainNameFilter)
    : null;
  const destDomainId = destinationChainNameFilter
    ? chainMetadataResolver.tryGetDomainId(destinationChainNameFilter)
    : null;

  // Validating filters
  const isValidOrigin = !originChainNameFilter || originDomainId !== null;
  const isValidDestination = !destinationChainNameFilter || destDomainId !== null;

  const warpAddresses = warpRouteAddresses.map((a) => a.address);

  // Resolve each warp route token to its domain for client-side filtering.
  // The DB filter matches on address bytes alone (sender OR recipient), so a
  // route whose address coincides with another route's address on a different
  // chain leaks in (e.g. BLEND messages showing up under CROSS/moonpay).
  // Addresses are not guaranteed unique across chains, so we additionally
  // require the matched address to be on its expected chain.
  const warpRouteDomainAddresses = useMemo(
    () =>
      warpRouteAddresses
        .map(({ chainName, address }) => ({
          domainId: chainMetadataResolver.tryGetDomainId(chainName),
          address,
        }))
        .filter((entry): entry is { domainId: number; address: string } => {
          if (entry.domainId === null) {
            // Drop unresolved chains loudly rather than silently widening the
            // filter — an empty domain list would skip filtering entirely and
            // leak unrelated messages (the very bug client-side filtering fixes).
            logger.warn('Could not resolve domainId for warp route chain, dropping from filter', {
              address: entry.address,
            });
            return false;
          }
          return true;
        }),
    [warpRouteAddresses, chainMetadataResolver],
  );

  // For pending filter, we use client-side filtering because the DB query for
  // is_delivered=false is slow (no index on absence of delivered_message record).
  // Instead, we fetch more messages and filter client-side.
  const isPendingFilter = statusFilter === 'pending';
  const dbStatusFilter = isPendingFilter ? 'all' : statusFilter;

  // Use larger batch size for pending filter to find more pending messages
  const baseLimit = hasInput ? SEARCH_QUERY_LIMIT : LATEST_QUERY_LIMIT;
  const queryLimit = isPendingFilter ? PENDING_FILTER_BATCH_SIZE : baseLimit;
  const liveSearchEnabled = isSearchMetadataReady && isValidInput;
  const hasFilters = !!(
    hasInput ||
    originChainNameFilter ||
    destinationChainNameFilter ||
    startTimeFilter ||
    endTimeFilter ||
    statusFilter !== 'all' ||
    warpRouteAddresses.length > 0
  );
  const liveDomains = useMemo(
    () => (hasFilters ? [] : mainnetDomainIds),
    [hasFilters, mainnetDomainIds],
  );
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
    { cached: shouldUseMessageQueryCache(explorerConnectionState) },
  );

  // Execute query
  const [result, reexecuteQuery] = useQuery<MessagesStubQueryResult>({
    query,
    variables,
    pause: !isValidInput || !isSearchMetadataReady,
    requestPolicy: 'cache-and-network',
  });
  const { data, fetching, error } = result;
  const isFetching = isValidInput && !isSearchMetadataError && (!isSearchMetadataReady || fetching);
  const refresh = useCallback(() => {
    if (!query || !isValidInput) return;
    reexecuteQuery({ requestPolicy: 'network-only' });
  }, [reexecuteQuery, query, isValidInput]);
  const { connected: isLiveConnected, messageRows: liveMessageRows } = useLatestMessageRows(
    liveSearchEnabled,
    liveDomains,
    refresh,
  );

  // Parse results
  const unfilteredMessageList = useMemo(
    () => parseMessageStubResult(chainMetadataResolver, scrapedChains, data),
    [chainMetadataResolver, scrapedChains, data],
  );
  const liveMessageList = useMemo(
    () =>
      liveMessageRows
        .map((message) => parseMessageStubEntry(chainMetadataResolver, scrapedChains, message))
        .filter((message): message is MessageStub => !!message),
    [chainMetadataResolver, scrapedChains, liveMessageRows],
  );
  const mergedUnfilteredMessageList = useMemo(
    () => mergeMessageLists(liveMessageList, unfilteredMessageList),
    [liveMessageList, unfilteredMessageList],
  );
  // Apply client-side filters. Note: these run after the DB LIMIT, so they
  // can shrink a page below the requested size — acceptable here since the
  // alternative (per-chain DB clauses) bloats the query and the pending
  // filter already relies on client-side narrowing.
  const messageList = useMemo(() => {
    let list = mergedUnfilteredMessageList;
    list = list.filter((message) =>
      messageMatchesSearchFilters(message, {
        searchInput: sanitizedInput,
        originDomainId: isValidOrigin ? originDomainId : null,
        destinationDomainId: isValidDestination ? destDomainId : null,
        startTime: startTimeFilter,
        endTime: endTimeFilter,
        status: statusFilter,
      }),
    );
    if (warpRouteDomainAddresses.length > 0) {
      list = list.filter((m) => messageMatchesWarpRoute(m, warpRouteDomainAddresses));
    }
    return list.slice(0, queryLimit);
  }, [
    mergedUnfilteredMessageList,
    sanitizedInput,
    isValidOrigin,
    originDomainId,
    isValidDestination,
    destDomainId,
    startTimeFilter,
    endTimeFilter,
    statusFilter,
    warpRouteDomainAddresses,
    queryLimit,
  ]);

  const isMessagesFound = messageList.length > 0;

  const poll = useCallback(() => {
    if (!isLiveConnected) refresh();
  }, [isLiveConnected, refresh]);
  useVisibleInterval(poll, SEARCH_AUTO_REFRESH_DELAY);

  return {
    isValidInput,
    isValidOrigin,
    isValidDestination,
    isFetching,
    isError: isSearchMetadataError || !!error,
    hasRun: isSearchMetadataReady && !!data,
    isMessagesFound,
    messageList,
    refetch: refresh,
  };
}

export function useMessageQuery({ messageId, pause }: { messageId: string; pause: boolean }) {
  const { scrapedDomains: scrapedChains } = useScrapedDomains();
  const chainMetadataResolver = useChainMetadataResolver();
  const explorerConnectionState = useExplorerConnectionState();

  // Assemble GraphQL Query
  const { query, variables } = buildMessageQuery(
    MessageIdentifierType.Id,
    messageId,
    1,
    false,
    undefined,
    { cached: shouldUseMessageQueryCache(explorerConnectionState) },
  );

  // Execute query
  const [{ data, fetching: isFetching, error }, reexecuteQuery] = useQuery<MessagesQueryResult>({
    query,
    variables,
    pause,
    requestPolicy: 'cache-and-network',
  });

  // Parse results
  const messageList = useMemo(
    () => parseMessageQueryResult(chainMetadataResolver, scrapedChains, data),
    [chainMetadataResolver, scrapedChains, data],
  );
  const refresh = useCallback(() => {
    if (pause) return;
    reexecuteQuery({ requestPolicy: 'network-only' });
  }, [pause, reexecuteQuery]);
  const { connected: isLiveConnected, messageRow: liveMessageRow } = useMessageRowSubscription(
    messageId,
    !pause,
    refresh,
  );
  const liveMessage = useMemo(
    () =>
      liveMessageRow
        ? parseMessageEntry(chainMetadataResolver, scrapedChains, liveMessageRow)
        : null,
    [chainMetadataResolver, scrapedChains, liveMessageRow],
  );
  const message = liveMessage ?? messageList[0] ?? null;
  const isMessageFound = !!message;
  const isDelivered = message?.status === MessageStatus.Delivered;
  const poll = useCallback(() => {
    if (!isLiveConnected && !isDelivered) refresh();
  }, [isDelivered, isLiveConnected, refresh]);
  useVisibleInterval(poll, MSG_AUTO_REFRESH_DELAY);

  return {
    isFetching,
    isError: !!error,
    hasRun: !!data,
    isMessageFound,
    message,
  };
}

function mergeMessageLists(
  liveMessages: MessageStub[],
  queryMessages: MessageStub[],
): MessageStub[] {
  const messagesById = new Map(
    queryMessages.map((message) => [message.msgId.toLowerCase(), message]),
  );
  liveMessages.forEach((message) => messagesById.set(message.msgId.toLowerCase(), message));
  return [...messagesById.values()].sort((a, b) => b.origin.timestamp - a.origin.timestamp);
}
