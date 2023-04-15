import { useQuery } from '@tanstack/react-query';

import { MultiProvider } from '@hyperlane-xyz/sdk';

import { getMultiProvider } from '../../../multiProvider';
import { useStore } from '../../../store';
import { Message } from '../../../types';
import { ensureLeading0x } from '../../../utils/addresses';
import { logger } from '../../../utils/logger';
import { ChainConfig } from '../../chains/chainConfig';
import { isValidSearchQuery } from '../queries/useMessageQuery';

import { PiMessageQuery, fetchMessagesFromPiChain } from './fetchPiChainMessages';

// Query 'Permissionless Interoperability (PI)' chains using custom
// chain configs in store state
export function usePiChainMessageQuery(
  sanitizedInput: string,
  startTimeFilter: number | null,
  endTimeFilter: number | null,
  pause: boolean,
) {
  const chainConfigs = useStore((s) => s.chainConfigs);
  const { isLoading, isError, data } = useQuery(
    ['usePiChainMessageQuery', chainConfigs, sanitizedInput, startTimeFilter, endTimeFilter, pause],
    async () => {
      const hasInput = !!sanitizedInput;
      const isValidInput = isValidSearchQuery(sanitizedInput, true);
      if (pause || !hasInput || !isValidInput || !Object.keys(chainConfigs).length) return [];
      logger.debug('Starting PI Chain message query for:', sanitizedInput);
      // TODO convert timestamps to from/to blocks here
      const query = { input: ensureLeading0x(sanitizedInput) };
      const multiProvider = getMultiProvider();
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
  };
}

async function fetchMessagesOrThrow(
  chainConfig: ChainConfig,
  query: PiMessageQuery,
  multiProvider: MultiProvider,
): Promise<Message[]> {
  const messages = await fetchMessagesFromPiChain(chainConfig, query, multiProvider);
  // Throw so Promise.any caller doesn't trigger
  if (!messages.length) throw new Error(`No messages found for chain ${chainConfig.chainId}`);
  return messages;
}
