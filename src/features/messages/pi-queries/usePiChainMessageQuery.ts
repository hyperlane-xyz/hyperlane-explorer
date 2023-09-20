import { useQuery } from '@tanstack/react-query';

import { MultiProvider } from '@hyperlane-xyz/sdk';
import { ensure0x } from '@hyperlane-xyz/utils';

import { Message } from '../../../types';
import { logger } from '../../../utils/logger';
import { ChainConfig } from '../../chains/chainConfig';
import { useChainConfigs } from '../../chains/useChainConfigs';
import { useMultiProvider } from '../../providers/multiProvider';
import { isValidSearchQuery } from '../queries/useMessageQuery';

import { PiMessageQuery, PiQueryType, fetchMessagesFromPiChain } from './fetchPiChainMessages';

// Query 'Permissionless Interoperability (PI)' chains using custom
// chain configs in store state
export function usePiChainMessageSearchQuery({
  sanitizedInput,
  startTimeFilter,
  endTimeFilter,
  pause,
}: {
  sanitizedInput: string;
  startTimeFilter: number | null;
  endTimeFilter: number | null;
  pause: boolean;
}) {
  const chainConfigs = useChainConfigs();
  const multiProvider = useMultiProvider();
  const { isLoading, isError, data } = useQuery(
    [
      'usePiChainMessageSearchQuery',
      chainConfigs,
      sanitizedInput,
      startTimeFilter,
      endTimeFilter,
      pause,
    ],
    async () => {
      const hasInput = !!sanitizedInput;
      const isValidInput = isValidSearchQuery(sanitizedInput, true);
      if (pause || !hasInput || !isValidInput || !Object.keys(chainConfigs).length) return [];
      logger.debug('Starting PI Chain message search for:', sanitizedInput);
      // TODO convert timestamps to from/to blocks here
      const query = { input: ensure0x(sanitizedInput) };
      try {
        const messages = await Promise.any(
          Object.values(chainConfigs).map((c) => fetchMessagesOrThrow(c, query, multiProvider)),
        );
        return messages;
      } catch (e) {
        logger.debug('Error fetching PI messages for:', sanitizedInput, e);
        return [];
      }
    },
    { retry: false },
  );

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
  const chainConfigs = useChainConfigs();
  const multiProvider = useMultiProvider();
  const { isLoading, isError, data } = useQuery(
    ['usePiChainMessageQuery', chainConfigs, messageId, pause],
    async () => {
      if (pause || !messageId || !Object.keys(chainConfigs).length) return [];
      logger.debug('Starting PI Chain message query for:', messageId);
      const query = { input: ensure0x(messageId) };
      try {
        const messages = await Promise.any(
          Object.values(chainConfigs).map((c) =>
            fetchMessagesOrThrow(c, query, multiProvider, PiQueryType.MsgId),
          ),
        );
        return messages;
      } catch (e) {
        logger.debug('Error fetching PI messages for:', messageId, e);
        return [];
      }
    },
    { retry: false },
  );

  const message = data?.length ? data[0] : null;
  const isMessageFound = !!message;

  return {
    isFetching: isLoading,
    isError,
    hasRun: !!data,
    message,
    isMessageFound,
  };
}

async function fetchMessagesOrThrow(
  chainConfig: ChainConfig,
  query: PiMessageQuery,
  multiProvider: MultiProvider,
  queryType?: PiQueryType,
): Promise<Message[]> {
  const messages = await fetchMessagesFromPiChain(chainConfig, query, multiProvider, queryType);
  // Throw so Promise.any caller doesn't trigger
  if (!messages.length) throw new Error(`No messages found for chain ${chainConfig.chainId}`);
  return messages;
}
