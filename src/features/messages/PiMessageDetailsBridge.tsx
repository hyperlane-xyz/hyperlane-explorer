import { useEffect } from 'react';

import type { Message } from '../../types';

import { usePiChainMessageQuery } from './pi-queries/usePiChainMessageQuery';

export interface PiMessageDetailsState {
  hasRun: boolean;
  isError: boolean;
  isFetching: boolean;
  isMessageFound: boolean;
  message: Message | null;
}

export const DEFAULT_PI_MESSAGE_DETAILS_STATE: PiMessageDetailsState = {
  hasRun: false,
  isError: false,
  isFetching: false,
  isMessageFound: false,
  message: null,
};

export function PiMessageDetailsBridge({
  messageId,
  onStateChange,
}: {
  messageId: string;
  onStateChange: (state: PiMessageDetailsState) => void;
}) {
  const { hasRun, isError, isFetching, message, isMessageFound } = usePiChainMessageQuery({
    messageId,
    pause: false,
  });

  useEffect(() => {
    onStateChange({
      hasRun,
      isError,
      isFetching,
      isMessageFound,
      message,
    });
  }, [hasRun, isError, isFetching, isMessageFound, message, onStateChange]);

  return null;
}
