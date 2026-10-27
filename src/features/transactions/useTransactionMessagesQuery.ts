import { useCallback, useMemo } from 'react';
import { useQuery } from 'urql';

import { useChainMetadataResolver } from '../../metadataStore';
import { useVisibleInterval } from '../../utils/useVisibleInterval';
import { useScrapedDomains } from '../chains/queries/useScrapedChains';
import { MessageIdentifierType, buildMessageQuery } from '../messages/queries/build';
import { MessagesQueryResult } from '../messages/queries/fragments';
import { parseMessageQueryResult } from '../messages/queries/parse';

const TX_AUTO_REFRESH_DELAY = 10_000; // 10s
const TX_QUERY_LIMIT = 500; // Scraper proxy maximum

/**
 * Hook to query all messages dispatched in a single origin transaction.
 * Returns full Message objects (not stubs) for detailed display.
 */
export function useTransactionMessagesQuery(txHash: string) {
  const { scrapedDomains: scrapedChains } = useScrapedDomains();
  const chainMetadataResolver = useChainMetadataResolver();

  // Build the GraphQL query for origin tx hash
  const { query, variables } = useMemo(
    () =>
      buildMessageQuery(
        MessageIdentifierType.OriginTxHash,
        txHash,
        TX_QUERY_LIMIT,
        false,
        'nonce: asc',
        // Include unconfirmed dispatches so fresh txs show before canonical indexing
        { provisional: true },
      ),
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
    const messages = parseMessageQueryResult(chainMetadataResolver, scrapedChains, data);
    // Sort by nonce (ascending) for consistent ordering
    return messages.sort((a, b) => a.nonce - b.nonce);
  }, [chainMetadataResolver, scrapedChains, data]);

  const isMessagesFound = messageList.length > 0;

  // Check if all messages are delivered. Provisional rows can still roll back, so keep polling.
  const allDelivered = useMemo(
    () => messageList.length > 0 && messageList.every((m) => m.destination && !m.isProvisional),
    [messageList],
  );

  // Setup interval to re-query (only if not all delivered)
  const reExecutor = useCallback(() => {
    if (!txHash || allDelivered) return;
    reexecuteQuery({ requestPolicy: 'network-only' });
  }, [reexecuteQuery, txHash, allDelivered]);
  useVisibleInterval(reExecutor, TX_AUTO_REFRESH_DELAY);

  return {
    isFetching,
    isError: !!error,
    error,
    hasRun: !!data || !!error,
    isMessagesFound,
    messageList,
    refetch: reExecutor,
  };
}
