import type { ChainMetadata } from '@hyperlane-xyz/sdk/metadata/chainMetadataTypes';
import { ensure0x } from '@hyperlane-xyz/utils';
import { useQuery } from '@tanstack/react-query';

import {
  useMultiProviderInitFailed,
  useMultiProviderVersion,
  useReadyMultiProvider,
  useRegistry,
} from '../../../store';
import { logger } from '../../../utils/logger';
import { useScrapedDomains } from '../../chains/queries/useScrapedChains';
import { isEvmChain, isPiChain } from '../../chains/utils';
import type { MessageLookupData } from '../messageLookup';
import { isValidSearchQuery } from '../queries/useMessageQuery';
import { PiQueryType, fetchMessagesFromPiChain } from './fetchPiChainMessages';

// Query 'Permissionless Interoperability (PI)' chains using
// override chain metadata in store state
export function usePiChainMessageSearchQuery({
  sanitizedInput,
  startTimeFilter,
  endTimeFilter,
  piQueryType,
  lookupData,
  pause,
}: {
  sanitizedInput: string;
  startTimeFilter?: number | null;
  endTimeFilter?: number | null;
  piQueryType?: PiQueryType;
  lookupData?: MessageLookupData;
  pause: boolean;
}) {
  const { scrapedDomains: scrapedChains } = useScrapedDomains();
  const multiProvider = useReadyMultiProvider();
  const multiProviderVersion = useMultiProviderVersion();
  const hasProviderInitFailed = useMultiProviderInitFailed();
  const registry = useRegistry();
  const isProviderError = !pause && !multiProvider && hasProviderInitFailed;

  const { isLoading, isError, data } = useQuery({
    queryKey: [
      'usePiChainMessageSearchQuery',
      sanitizedInput,
      startTimeFilter,
      endTimeFilter,
      piQueryType,
      lookupData,
      scrapedChains,
      multiProviderVersion,
      registry,
      pause,
    ],
    queryFn: async () => {
      const hasInput = !!sanitizedInput;
      const isValidInput = isValidSearchQuery(sanitizedInput);
      if (pause || !multiProvider || !hasInput || !isValidInput) return [];
      logger.debug('Starting PI Chain message search for:', sanitizedInput);
      // TODO handle time-based filters here
      const query = { input: ensure0x(sanitizedInput) };
      const allChains: ChainMetadata[] = Object.values(multiProvider.metadata);
      const piChains = allChains.filter(
        (c) =>
          c.domainId !== undefined &&
          isEvmChain(multiProvider, c.domainId) &&
          isPiChain(multiProvider, scrapedChains, c.domainId),
      );
      const results = await Promise.allSettled(
        piChains.map((c) =>
          fetchMessagesFromPiChain(
            c,
            {
              ...query,
              transactionHash:
                lookupData && c.domainId === lookupData.originDomainId
                  ? lookupData.origin.hash
                  : undefined,
            },
            multiProvider,
            registry,
            piQueryType,
          ),
        ),
      );
      const messages = results.flatMap((result) =>
        result.status === 'fulfilled' ? result.value : [],
      );
      const errors = results.flatMap((result, index) => {
        if (result.status === 'fulfilled') return [];
        logger.warn('Error fetching PI messages for chain:', piChains[index].name, result.reason);
        return [result.reason];
      });
      if (!messages.length && errors.length) {
        throw new AggregateError(errors, 'PI message lookup failed');
      }
      return messages;
    },
    retry: false,
    enabled: !pause && !!multiProvider,
  });

  return {
    isFetching: isLoading,
    isError: isError || isProviderError,
    hasRun: !!data || isError || isProviderError,
    messageList: data || [],
    isMessagesFound: !!data?.length,
  };
}

export function usePiChainMessageQuery({
  messageId,
  lookupData,
  pause,
}: {
  messageId: string;
  lookupData?: MessageLookupData;
  pause: boolean;
}) {
  const { hasRun, isError, isFetching, messageList } = usePiChainMessageSearchQuery({
    sanitizedInput: messageId,
    startTimeFilter: null,
    endTimeFilter: null,
    piQueryType: PiQueryType.MsgId,
    lookupData,
    pause,
  });

  const message =
    messageList.find((m) => m.msgId.toLowerCase() === ensure0x(messageId).toLowerCase()) ?? null;
  const isMessageFound = !!message;

  return {
    isFetching,
    isError,
    hasRun,
    message,
    isMessageFound,
  };
}
