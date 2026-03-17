import { useEffect } from 'react';
import {
  PiMessageDetailsState,
} from './piMessageDetailsState';
import { usePiChainMessageQuery } from './pi-queries/usePiChainMessageQuery';

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
