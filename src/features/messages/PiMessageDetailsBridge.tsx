import { useEffect } from 'react';
import { usePiChainMessageQuery } from './pi-queries/usePiChainMessageQuery';
import { PiMessageDetailsState } from './piMessageDetailsState';

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
