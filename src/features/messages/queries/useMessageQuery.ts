import { eqAddress, isAddress } from '@hyperlane-xyz/utils';
import { useCallback, useMemo } from 'react';
import { createRequest, useQuery } from 'urql';

import { useChainMetadataResolver } from '../../../metadataStore';
import { MessageStatus, MessageStatusFilter, MessageStub } from '../../../types';
import { logger } from '../../../utils/logger';
import { adjustToUtcTime } from '../../../utils/time';
import { useVisibleInterval } from '../../../utils/useVisibleInterval';
import { useScrapedChains, useScrapedDomains } from '../../chains/queries/useScrapedChains';
import {
  MessageIdentifierType,
  PROVISIONAL_QUERY_KEY,
  type MessagePageCursor,
  buildMessageQuery,
  buildMessageSearchQuery,
} from './build';
import {
  isPotentiallyTransactionHash,
  postgresByteaToString,
  searchValueToPostgresBytea,
} from './encoding';
import { MessagesQueryResult, MessagesStubQueryResult, MessageStubEntry } from './fragments';
import {
  compareMessageIdsDescending,
  parseMessageEntry,
  parseMessageQueryResult,
  parseMessageStubEntry,
  parseMessageStubResult,
} from './parse';
import {
  type ExplorerConnectionState,
  useExplorerEvents,
  useExplorerRefresh,
  filterLatestMessageRows,
  useMessageRowSubscription,
  preserveMessageTransactionFields,
  useRetainedMessage,
} from './useLiveMessages';

const SEARCH_AUTO_REFRESH_DELAY = 15_000;
const MSG_AUTO_REFRESH_DELAY = 10_000;
const MESSAGE_PAGE_SIZE = 50;

// Larger batch size for pending filter since most messages are delivered quickly,
// so we need to fetch more to find pending ones.
const PENDING_FILTER_BATCH_SIZE = 500;

export function getMessagePage(
  filteredMessages: MessageStub[],
  rawRows: Array<Pick<MessageStubEntry, 'id' | 'msg_id'>>,
  queryLimit: number,
) {
  const candidatesByHash = new Map(filteredMessages.map((m) => [m.msgId.toLowerCase(), m]));
  const canonicalIds = new Map(
    rawRows.map((row) => [postgresByteaToString(row.msg_id).toLowerCase(), String(row.id)]),
  );
  // Only canonical rows determine page membership and cursors. Raw and canonical
  // database IDs can collide; message hashes identify rows across both sources.
  const canonicalMessages = [...canonicalIds].slice(0, queryLimit).flatMap(([hash, id]) => {
    const message = candidatesByHash.get(hash);
    return message ? [message.id === id ? message : { ...message, id }] : [];
  });
  const canonicalPage = canonicalMessages.slice(0, MESSAGE_PAGE_SIZE);
  const liveOnlyMessages = filteredMessages.filter((m) => !canonicalIds.has(m.msgId.toLowerCase()));
  const pageMessages = [...canonicalPage, ...liveOnlyMessages];
  const canonicalPageBoundary = canonicalPage.at(-1)?.id;
  const continuationCursor =
    canonicalMessages.length > MESSAGE_PAGE_SIZE
      ? (canonicalPageBoundary ?? null)
      : rawRows.length >= queryLimit
        ? String(rawRows[queryLimit - 1].id)
        : null;
  const messages = pageMessages.sort(
    (a, b) => b.origin.timestamp - a.origin.timestamp || compareMessageIdsDescending(a, b),
  );
  return {
    messages,
    continuationCursor,
    reverseCursor: rawRows[0] ? String(rawRows[0].id) : null,
  };
}

export function getRawMessageRows(
  data: Record<string, Array<Pick<MessageStubEntry, 'id' | 'msg_id'>> | null> | undefined,
  ascending: boolean,
) {
  return [
    ...new Map(
      Object.entries(data ?? {})
        .filter(([alias]) => alias !== PROVISIONAL_QUERY_KEY)
        .flatMap(([, rows]) => (rows ?? []).map((row) => [String(row.id), row] as const)),
    ).values(),
  ].sort((a, b) => {
    const aId = BigInt(a.id);
    const bId = BigInt(b.id);
    const descending = aId === bId ? 0 : aId > bId ? -1 : 1;
    return ascending ? -descending : descending;
  });
}

export function isValidSearchQuery(input: string) {
  if (!input) return false;
  return !!searchValueToPostgresBytea(input);
}

export function getSearchMetadataState(
  scrapedDomainCount: number,
  mainnetDomainCount: number,
  hasRun: boolean,
  isError: boolean,
) {
  const isReady = scrapedDomainCount > 0 && mainnetDomainCount > 0;
  return {
    isReady,
    isError: isError || (hasRun && (!scrapedDomainCount || !mainnetDomainCount)),
  };
}

export function shouldUseMessageQueryCache(connectionState: ExplorerConnectionState) {
  return connectionState !== 'connected';
}

export function shouldPollMessageDetails(
  isLiveConnected: boolean,
  isDelivered: boolean,
  isProvisional: boolean,
) {
  return isProvisional || (!isLiveConnected && !isDelivered);
}

export function shouldResetToFirstMessagePage(
  isBeforeQuery: boolean,
  hasRun: boolean,
  isFetching: boolean,
  continuationCursor: string | null,
) {
  return isBeforeQuery && hasRun && !isFetching && !continuationCursor;
}

export function doesQueryResultMatchRequest(requestKey: number, resultOperationKey?: number) {
  return requestKey === resultOperationKey;
}

export function getMessageSearchDomainIds(
  mainnetDomainIds: number[],
  hasIdentifierSearch: boolean,
  selectedDomainIds: number[],
) {
  const selectsTestnet = selectedDomainIds.some((domainId) => !mainnetDomainIds.includes(domainId));
  return hasIdentifierSearch || selectsTestnet ? [] : mainnetDomainIds;
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

export function getMessageCandidates(
  liveMessages: MessageStub[],
  queryMessages: MessageStub[],
  filters: MessageSearchFilters,
  warpRouteDomainAddresses: Array<{ domainId: number; address: string }>,
): MessageStub[] {
  return mergeMessageLists(liveMessages, queryMessages).filter(
    (message) =>
      messageMatchesSearchFilters(message, filters) &&
      (!warpRouteDomainAddresses.length ||
        messageMatchesWarpRoute(message, warpRouteDomainAddresses)),
  );
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
  cursor: MessagePageCursor = {},
) {
  if (cursor.after && cursor.before) {
    throw new Error('Message search cannot use both before and after cursors');
  }
  const cursorValue = cursor.before || cursor.after || null;
  const isBeforeQuery = !!cursor.before;
  const chainMetadataResolver = useChainMetadataResolver();
  const {
    chains,
    scrapedDomains: scrapedChains,
    isError: isSearchMetadataQueryError,
    hasRun: hasSearchMetadataRun,
    retry: retrySearchMetadata,
  } = useScrapedChains(chainMetadataResolver);
  const { connectionState: explorerConnectionState, messageRows: liveMessageRows } =
    useExplorerEvents();
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
    hasSearchMetadataRun,
    isSearchMetadataQueryError,
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

  const queryLimit = isPendingFilter ? PENDING_FILTER_BATCH_SIZE : MESSAGE_PAGE_SIZE + 1;
  const liveSearchEnabled = isSearchMetadataReady && isValidInput;
  const searchDomainIds = useMemo(() => {
    const selectedDomainIds = [
      originDomainId,
      destDomainId,
      ...warpRouteDomainAddresses.map((a) => a.domainId),
    ].filter((domainId): domainId is number => domainId !== null);
    return getMessageSearchDomainIds(mainnetDomainIds, hasInput, selectedDomainIds);
  }, [destDomainId, hasInput, mainnetDomainIds, originDomainId, warpRouteDomainAddresses]);
  const { query, variables } = buildMessageSearchQuery(
    sanitizedInput,
    isValidOrigin ? originDomainId : null,
    isValidDestination ? destDomainId : null,
    startTimeFilter,
    endTimeFilter,
    queryLimit,
    true,
    searchDomainIds,
    dbStatusFilter,
    warpAddresses,
    {
      // A reload must not reuse a snapshot from before a provisional event.
      cached: !!cursorValue && shouldUseMessageQueryCache(explorerConnectionState),
      ...cursor,
    },
  );

  // Execute query
  const [result, reexecuteQuery] = useQuery<MessagesStubQueryResult>({
    query,
    variables,
    pause: !isValidInput || !isSearchMetadataReady,
    requestPolicy: 'cache-and-network',
  });
  const { data, fetching, error } = result;
  const hasCurrentQueryResult =
    !!data &&
    doesQueryResultMatchRequest(createRequest(query, variables).key, result.operation?.key);
  const isFetching = isValidInput && !isSearchMetadataError && (!isSearchMetadataReady || fetching);
  const refresh = useCallback(() => {
    if (!query || !isValidInput) return;
    if (!isSearchMetadataReady) {
      retrySearchMetadata().catch((error) =>
        logger.error('Error retrying message search metadata', error),
      );
      return;
    }
    reexecuteQuery({ requestPolicy: 'network-only' });
  }, [isSearchMetadataReady, isValidInput, query, reexecuteQuery, retrySearchMetadata]);
  useExplorerRefresh(liveSearchEnabled, refresh);

  // Parse results
  const unfilteredMessageList = useMemo(
    () => parseMessageStubResult(chainMetadataResolver, scrapedChains, data),
    [chainMetadataResolver, scrapedChains, data],
  );
  const rawMessageRows = useMemo(
    () => getRawMessageRows(data, isBeforeQuery),
    [data, isBeforeQuery],
  );
  const liveMessageList = useMemo(
    () =>
      filterLatestMessageRows(
        liveSearchEnabled && !cursorValue ? liveMessageRows : [],
        searchDomainIds,
      )
        .map((message) => parseMessageStubEntry(chainMetadataResolver, scrapedChains, message))
        .filter((message): message is MessageStub => !!message),
    [
      chainMetadataResolver,
      scrapedChains,
      liveMessageRows,
      liveSearchEnabled,
      cursorValue,
      searchDomainIds,
    ],
  );
  // Filter before pagination so unrelated live rows cannot evict query matches.
  // Raw query metadata controls cursor continuation.
  const candidateMessageList = getMessageCandidates(
    liveMessageList,
    unfilteredMessageList,
    {
      searchInput: sanitizedInput,
      originDomainId: isValidOrigin ? originDomainId : null,
      destinationDomainId: isValidDestination ? destDomainId : null,
      startTime: startTimeFilter,
      endTime: endTimeFilter,
      status: statusFilter,
    },
    warpRouteDomainAddresses,
  );

  const {
    messages: paginatedMessageList,
    continuationCursor,
    reverseCursor,
  } = getMessagePage(candidateMessageList, rawMessageRows, queryLimit);
  const previousCursor = isBeforeQuery ? continuationCursor : reverseCursor;
  const nextCursor = isBeforeQuery ? reverseCursor : continuationCursor;
  const isMessagesFound = paginatedMessageList.length > 0;
  const hasRun = isSearchMetadataReady && hasCurrentQueryResult;
  const shouldResetToFirstPage = shouldResetToFirstMessagePage(
    isBeforeQuery,
    hasRun,
    isFetching,
    continuationCursor,
  );

  // Reconcile the live page: the websocket is an overlay, not a complete log.
  useVisibleInterval(refresh, cursorValue ? null : SEARCH_AUTO_REFRESH_DELAY);

  return {
    isValidInput,
    isValidOrigin,
    isValidDestination,
    isFetching,
    isError: isSearchMetadataError || !!error,
    hasRun,
    isMessagesFound,
    messageList: paginatedMessageList,
    previousCursor: cursorValue ? previousCursor : null,
    nextCursor,
    shouldResetToFirstPage,
    refetch: refresh,
  };
}

export function useMessageQuery({ messageId, pause }: { messageId: string; pause: boolean }) {
  const { scrapedDomains: scrapedChains } = useScrapedDomains();
  const chainMetadataResolver = useChainMetadataResolver();
  const { connectionState: explorerConnectionState } = useExplorerEvents();

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
  const liveMessageExpired = isLiveMessageExpired(liveMessage);
  const selectedMessage = useMemo(
    () => selectLiveMessage(liveMessage, messageList[0] ?? null, liveMessageExpired),
    [liveMessage, messageList, liveMessageExpired],
  );
  const message = useRetainedMessage(selectedMessage);
  const isMessageFound = !!message;
  const isDelivered = message?.status === MessageStatus.Delivered;
  const poll = useCallback(() => {
    if (shouldPollMessageDetails(isLiveConnected, isDelivered, !!message?.isProvisional)) {
      refresh();
    }
  }, [isDelivered, isLiveConnected, message?.isProvisional, refresh]);
  useVisibleInterval(poll, MSG_AUTO_REFRESH_DELAY);

  return {
    isFetching,
    isError: !!error,
    hasRun: !!data,
    isMessageFound,
    message,
  };
}

export function selectLiveMessage<M extends MessageStub>(
  liveMessage: M | null,
  canonicalMessage: M | null,
  liveMessageExpired = isLiveMessageExpired(liveMessage),
) {
  if (!liveMessage) return canonicalMessage;
  if (!canonicalMessage) return liveMessage;
  // Bound the overlay's authority: missed rollbacks must yield to polled snapshots.
  return !liveMessageExpired && liveMessage.status !== canonicalMessage.status
    ? preserveMessageTransactionFields(liveMessage, canonicalMessage)
    : preserveMessageTransactionFields(canonicalMessage, liveMessage);
}

function isLiveMessageExpired(message: MessageStub | null) {
  return message?.liveReceivedAt !== undefined && Date.now() - message.liveReceivedAt >= 30_000;
}

function mergeMessageLists(
  liveMessages: MessageStub[],
  queryMessages: MessageStub[],
): MessageStub[] {
  const messagesById = new Map(
    queryMessages.map((message) => [message.msgId.toLowerCase(), message]),
  );
  liveMessages.forEach((message) => {
    const key = message.msgId.toLowerCase();
    messagesById.set(key, selectLiveMessage(message, messagesById.get(key) ?? null)!);
  });
  return [...messagesById.values()];
}
