import { useCallback, useMemo } from 'react';
import { useQuery } from 'urql';

import { useMultiProvider } from '../../../store';
import { MessageStatus } from '../../../types';
import { useScrapedDomains } from '../../chains/queries/useScrapedChains';

import { MultiProvider } from '@hyperlane-xyz/sdk';
import { useInterval } from '@hyperlane-xyz/widgets';
import { MessageIdentifierType, buildMessageQuery, buildMessageSearchQuery } from './build';
import { searchValueToPostgresBytea } from './encoding';
import { MessagesQueryResult, MessagesStubQueryResult } from './fragments';
import { parseMessageQueryResult, parseMessageStubResult } from './parse';

const SEARCH_AUTO_REFRESH_DELAY = 15_000; // 15s
const MSG_AUTO_REFRESH_DELAY = 10_000; // 10s
const LATEST_QUERY_LIMIT = 100;
const SEARCH_QUERY_LIMIT = 50;

export function isValidSearchQuery(input: string) {
  if (!input) return false;
  return !!searchValueToPostgresBytea(input);
}

export function isValidDomainId(domainId: string | null, multiProvider: MultiProvider) {
  if (!domainId) return false;
  return multiProvider.hasChain(domainId);
}

export function useMessageSearchQuery(
  sanitizedInput: string,
  originChainFilter: string | null,
  destinationChainFilter: string | null,
  startTimeFilter: number | null,
  endTimeFilter: number | null,
) {
  const { scrapedDomains: scrapedChains } = useScrapedDomains();
  const multiProvider = useMultiProvider();

  const hasInput = !!sanitizedInput;
  const isValidInput = !hasInput || isValidSearchQuery(sanitizedInput);

  // validating filters
  const isValidOrigin = !originChainFilter || isValidDomainId(originChainFilter, multiProvider);
  const isValidDestination =
    !destinationChainFilter || isValidDomainId(destinationChainFilter, multiProvider);

  // Assemble GraphQL query
  const { query, variables } = buildMessageSearchQuery(
    sanitizedInput,
    isValidOrigin ? originChainFilter : null,
    isValidDestination ? destinationChainFilter : null,
    startTimeFilter,
    endTimeFilter,
    hasInput ? SEARCH_QUERY_LIMIT : LATEST_QUERY_LIMIT,
    true,
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

  // Filter recent messages during DB backfilling period
  // TODO remove this once backfilling is complete
  const hasFilter = !!(
    originChainFilter ||
    destinationChainFilter ||
    startTimeFilter ||
    endTimeFilter
  );
  const messageList = useMemo(() => {
    if (hasInput || hasFilter) return unfilteredMessageList;
    return unfilteredMessageList
      .filter((m) => Date.now() - m.origin.timestamp < 1000 * 60 * 60) // filter out messages older than 1 hour
      .slice(0, 20);
  }, [hasInput, hasFilter, unfilteredMessageList]);

  const isMessagesFound = messageList.length > 0;

  // Setup interval to re-query
  const reExecutor = useCallback(() => {
    if (!query || !isValidInput || !isWindowVisible()) return;
    reexecuteQuery({ requestPolicy: 'network-only' });
  }, [reexecuteQuery, query, isValidInput]);
  useInterval(reExecutor, SEARCH_AUTO_REFRESH_DELAY);

  return {
    isValidInput,
    isFetching,
    isError: !!error,
    hasRun: !!data,
    isMessagesFound,
    messageList,
    isValidOrigin,
    isValidDestination,
    refetch: reExecutor,
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
