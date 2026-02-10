import { useCallback, useMemo } from 'react';
import { useQuery } from 'urql';

import { useInterval } from '@hyperlane-xyz/widgets';

import { useMultiProvider } from '../../store';
import { Message } from '../../types';
import { useScrapedDomains } from '../chains/queries/useScrapedChains';
import { MessageIdentifierType, buildMessageQuery } from '../messages/queries/build';
import { MessagesQueryResult } from '../messages/queries/fragments';
import { parseMessageQueryResult } from '../messages/queries/parse';

const TX_AUTO_REFRESH_DELAY = 10_000; // 10s
const TX_QUERY_LIMIT = 1000; // Max messages per transaction

/**
 * Hook to query all messages dispatched in a single origin transaction.
 * Returns full Message objects (not stubs) for detailed display.
 */
export function useTransactionMessagesQuery(txHash: string) {
  const { scrapedDomains: scrapedChains } = useScrapedDomains();
  const multiProvider = useMultiProvider();

  // Build the GraphQL query for origin tx hash
  const { query, variables } = useMemo(
    () => buildMessageQuery(MessageIdentifierType.OriginTxHash, txHash, TX_QUERY_LIMIT, false),
    [txHash],
  );

  // Execute query
  const [result, reexecuteQuery] = useQuery<MessagesQueryResult>({
    query,
    variables,
    pause: !txHash,
  });
  const { data, fetching: isFetching, error } = result;

  // Parse results into Message objects
  const messageList = useMemo(() => {
    const messages = parseMessageQueryResult(multiProvider, scrapedChains, data);
    // Sort by nonce (ascending) for consistent ordering
    return messages.sort((a, b) => a.nonce - b.nonce);
  }, [multiProvider, scrapedChains, data]);

  const isMessagesFound = messageList.length > 0;

  // Check if all messages are delivered
  const allDelivered = useMemo(
    () => messageList.length > 0 && messageList.every((m) => m.destination),
    [messageList],
  );

  // Setup interval to re-query (only if not all delivered)
  const reExecutor = useCallback(() => {
    if (!txHash || allDelivered || !isWindowVisible()) return;
    reexecuteQuery({ requestPolicy: 'network-only' });
  }, [reexecuteQuery, txHash, allDelivered]);
  useInterval(reExecutor, TX_AUTO_REFRESH_DELAY);

  // Extract common origin transaction info from the first message
  const originInfo = useMemo(() => {
    if (!messageList.length) return null;
    const first = messageList[0];
    return {
      chainName: multiProvider.tryGetChainName(first.originDomainId) || 'Unknown',
      domainId: first.originDomainId,
      transaction: first.origin,
    };
  }, [messageList, multiProvider]);

  return {
    isFetching,
    isError: !!error,
    hasRun: !!data,
    isMessagesFound,
    messageList: messageList as Message[],
    originInfo,
    refetch: reExecutor,
  };
}

function isWindowVisible() {
  return document.visibilityState === 'visible';
}
