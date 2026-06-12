import { eqAddress } from '@hyperlane-xyz/utils';
import { useCallback, useMemo } from 'react';
import { useQuery } from 'urql';

import { useChainMetadataResolver } from '../../../metadataStore';
import { MessageStatus, MessageStatusFilter, MessageStub } from '../../../types';
import { logger } from '../../../utils/logger';
import { useVisibleInterval } from '../../../utils/useVisibleInterval';
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
  const chainMetadataResolver = useChainMetadataResolver();
  const { chains } = useScrapedChains(chainMetadataResolver);
  const mainnetDomainIds = Object.values(chains)
    .filter((chain) => !chain.isTestnet)
    .map((chain) => chain.domainId);

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
    () => parseMessageStubResult(chainMetadataResolver, scrapedChains, data),
    [chainMetadataResolver, scrapedChains, data],
  );

  // Apply client-side filters. Note: these run after the DB LIMIT, so they
  // can shrink a page below the requested size — acceptable here since the
  // alternative (per-chain DB clauses) bloats the query and the pending
  // filter already relies on client-side narrowing.
  const messageList = useMemo(() => {
    let list = unfilteredMessageList;
    if (isPendingFilter) {
      list = list.filter((m) => m.status === MessageStatus.Pending);
    }
    if (warpRouteDomainAddresses.length > 0) {
      list = list.filter((m) => messageMatchesWarpRoute(m, warpRouteDomainAddresses));
    }
    return list;
  }, [unfilteredMessageList, isPendingFilter, warpRouteDomainAddresses]);

  const isMessagesFound = messageList.length > 0;

  // Auto-refresh query periodically
  const refresh = useCallback(() => {
    if (!query || !isValidInput) return;
    reexecuteQuery({ requestPolicy: 'network-only' });
  }, [reexecuteQuery, query, isValidInput]);
  useVisibleInterval(refresh, SEARCH_AUTO_REFRESH_DELAY);

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
  const chainMetadataResolver = useChainMetadataResolver();

  // Assemble GraphQL Query
  const { query, variables } = buildMessageQuery(MessageIdentifierType.Id, messageId, 1);

  // Execute query
  const [{ data, fetching: isFetching, error }, reexecuteQuery] = useQuery<MessagesQueryResult>({
    query,
    variables,
    pause,
  });

  // Parse results
  const messageList = useMemo(
    () => parseMessageQueryResult(chainMetadataResolver, scrapedChains, data),
    [chainMetadataResolver, scrapedChains, data],
  );
  const isMessageFound = messageList.length > 0;
  const message = isMessageFound ? messageList[0] : null;
  const msgStatus = message?.status;
  const isDelivered = isMessageFound && msgStatus === MessageStatus.Delivered;

  // Setup interval to re-query
  const reExecutor = useCallback(() => {
    if (pause || isDelivered) return;
    reexecuteQuery({ requestPolicy: 'network-only' });
  }, [pause, isDelivered, reexecuteQuery]);
  useVisibleInterval(reExecutor, MSG_AUTO_REFRESH_DELAY);

  return {
    isFetching,
    isError: !!error,
    hasRun: !!data,
    isMessageFound,
    message,
  };
}
