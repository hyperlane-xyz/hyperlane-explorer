import { useQuery } from '@tanstack/react-query';

import { useStore } from '../../../store';
import { logger } from '../../../utils/logger';

import { isValidSearchQuery } from './useMessageQuery';

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
      if (pause || !hasInput || !isValidInput || !Object.keys(chainConfigs).length) return null;
      logger.debug('Starting PI Chain message query for:', sanitizedInput);
      return [];
    },
    { retry: false },
  );

  return {
    isFetching: isLoading,
    isError,
    messageList: data,
  };
}
