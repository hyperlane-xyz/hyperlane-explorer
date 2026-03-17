import { useEffect } from 'react';

import type { Message } from '../../types';

import { usePiChainMessageSearchQuery } from './pi-queries/usePiChainMessageQuery';

export interface PiMessageSearchState {
  hasRun: boolean;
  isError: boolean;
  isFetching: boolean;
  isMessagesFound: boolean;
  messageList: Message[];
}

export const DEFAULT_PI_MESSAGE_SEARCH_STATE: PiMessageSearchState = {
  hasRun: false,
  isError: false,
  isFetching: false,
  isMessagesFound: false,
  messageList: [],
};

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
