import { useEffect } from 'react';

import { usePiChainMessageSearchQuery } from './pi-queries/usePiChainMessageQuery';
import { PiMessageSearchState } from './piSearchState';

export function PiMessageSearchBridge({
  endTimeFilter,
  onStateChange,
  sanitizedInput,
  startTimeFilter,
}: {
  endTimeFilter: number | null;
  onStateChange: (state: PiMessageSearchState) => void;
  sanitizedInput: string;
  startTimeFilter: number | null;
}) {
  const { hasRun, isError, isFetching, isMessagesFound, messageList } =
    usePiChainMessageSearchQuery({
      sanitizedInput,
      startTimeFilter,
      endTimeFilter,
      pause: false,
    });

  useEffect(() => {
    onStateChange({
      hasRun,
      isError,
      isFetching,
      isMessagesFound,
      messageList,
    });
  }, [hasRun, isError, isFetching, isMessagesFound, messageList, onStateChange]);

  return null;
}
