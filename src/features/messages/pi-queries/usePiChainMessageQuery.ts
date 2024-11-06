import { useQuery } from '@tanstack/react-query';

import { IRegistry } from '@hyperlane-xyz/registry';
import { ChainMetadata, MultiProvider } from '@hyperlane-xyz/sdk';
import { ensure0x, timeout } from '@hyperlane-xyz/utils';

import { useReadyMultiProvider, useRegistry } from '../../../store';
import { Message } from '../../../types';
import { logger } from '../../../utils/logger';
import { useScrapedDomains } from '../../chains/queries/useScrapedChains';
import { isEvmChain, isPiChain } from '../../chains/utils';
import { isValidSearchQuery } from '../queries/useMessageQuery';

import { PiMessageQuery, PiQueryType, fetchMessagesFromPiChain } from './fetchPiChainMessages';

const MESSAGE_SEARCH_TIMEOUT = 10_000; // 10s

// Query 'Permissionless Interoperability (PI)' chains using
// override chain metadata in store state
export function usePiChainMessageSearchQuery({
  sanitizedInput,
  startTimeFilter,
  endTimeFilter,
  piQueryType,
  pause,
}: {
  sanitizedInput: string;
  startTimeFilter?: number | null;
  endTimeFilter?: number | null;
  piQueryType?: PiQueryType;
  pause: boolean;
}) {
  const { scrapedDomains: scrapedChains } = useScrapedDomains();
  const multiProvider = useReadyMultiProvider();
  const registry = useRegistry();

  const { isLoading, isError, data } = useQuery({
    queryKey: [
      'usePiChainMessageSearchQuery',
      sanitizedInput,
      startTimeFilter,
      endTimeFilter,
      !!multiProvider,
      registry,
      pause,
    ],
    queryFn: async () => {
      const hasInput = !!sanitizedInput;
      const isValidInput = isValidSearchQuery(sanitizedInput, true);
      if (pause || !multiProvider || !hasInput || !isValidInput) return [];
      logger.debug('Starting PI Chain message search for:', sanitizedInput);
      // TODO handle time-based filters here
      const query = { input: ensure0x(sanitizedInput) };
      const allChains = Object.values(multiProvider.metadata);
      const piChains = allChains.filter(
        (c) =>
          c.domainId !== undefined &&
          isEvmChain(multiProvider, c.domainId) &&
          isPiChain(multiProvider, scrapedChains, c.domainId),
      );
      try {
        const results = await Promise.allSettled(
          piChains.map((c) => fetchMessages(c, query, multiProvider, registry, piQueryType)),
        );
        return results
          .filter(
            (result): result is PromiseFulfilledResult<Message[]> => result.status === 'fulfilled',
          )
          .map((result) => result.value)
          .flat();
      } catch (e) {
        logger.debug('No PI messages found for query:', sanitizedInput);
        return [];
      }
    },
    retry: false,
  });

  return {
    isFetching: isLoading,
    isError,
    hasRun: !!data,
    messageList: data || [],
    isMessagesFound: !!data?.length,
  };
}

export function usePiChainMessageQuery({
  messageId,
  pause,
}: {
  messageId: string;
  pause: boolean;
}) {
  const { hasRun, isError, isFetching, messageList } = usePiChainMessageSearchQuery({
    sanitizedInput: messageId,
    startTimeFilter: null,
    endTimeFilter: null,
    piQueryType: PiQueryType.MsgId,
    pause,
  });

  const message = messageList?.length ? messageList[0] : null;
  const isMessageFound = !!message;

  return {
    isFetching,
    isError,
    hasRun,
    message,
    isMessageFound,
  };
}

async function fetchMessages(
  chainMetadata: ChainMetadata,
  query: PiMessageQuery,
  multiProvider: MultiProvider,
  registry: IRegistry,
  queryType?: PiQueryType,
): Promise<Message[]> {
  let messages: Message[];
  try {
    messages = await timeout(
      fetchMessagesFromPiChain(chainMetadata, query, multiProvider, registry, queryType),
      MESSAGE_SEARCH_TIMEOUT,
      'message search timeout',
    );
    return messages;
  } catch (error) {
    logger.debug('Error fetching PI messages for chain:', chainMetadata.name, error);
    throw error;
  }
}
