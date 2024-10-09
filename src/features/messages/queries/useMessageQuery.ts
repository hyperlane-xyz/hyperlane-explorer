import { useCallback, useMemo } from 'react';
import { useQuery } from 'urql';

import {
  isAddress,
  isValidTransactionHashCosmos,
  isValidTransactionHashEvm,
} from '@hyperlane-xyz/utils';

import { useMultiProvider } from '../../../store';
import { MessageStatus } from '../../../types';
import { useInterval } from '../../../utils/useInterval';
import { useScrapedDomains } from '../../chains/queries/useScrapedChains';

import { MessageIdentifierType, buildMessageQuery, buildMessageSearchQuery } from './build';
import { MessagesQueryResult, MessagesStubQueryResult } from './fragments';
import { parseMessageQueryResult, parseMessageStubResult } from './parse';

const SEARCH_AUTO_REFRESH_DELAY = 15_000; // 15s
const MSG_AUTO_REFRESH_DELAY = 10_000; // 10s
const LATEST_QUERY_LIMIT = 20;
const SEARCH_QUERY_LIMIT = 50;

export function isValidSearchQuery(input: string, allowAddress?: boolean) {
  if (!input) return false;
  return !!(
    isValidTransactionHashEvm(input) ||
    isValidTransactionHashCosmos(input) ||
    (allowAddress && isAddress(input))
  );
}

export function useMessageSearchQuery(
  sanitizedInput: string,
  originChainFilter: string | null,
  destinationChainFilter: string | null,
  startTimeFilter: number | null,
  endTimeFilter: number | null,
) {
  const { scrapedDomains: scrapedChains } = useScrapedDomains();

  const hasInput = !!sanitizedInput;
  const isValidInput = hasInput ? isValidSearchQuery(sanitizedInput, true) : true;

  // Assemble GraphQL query
  const { query, variables } = buildMessageSearchQuery(
    sanitizedInput,
    originChainFilter,
    destinationChainFilter,
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
  const multiProvider = useMultiProvider();
  const messageList = useMemo(
    () => parseMessageStubResult(multiProvider, scrapedChains, data),
    [multiProvider, scrapedChains, data],
  );
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
