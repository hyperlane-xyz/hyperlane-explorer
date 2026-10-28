import { useEffect, useMemo } from 'react';

import { useQueryParam } from '../../utils/queryParams';
import { parseMessageLookupData } from './messageLookup';
import { usePiChainMessageQuery } from './pi-queries/usePiChainMessageQuery';
import { PiMessageDetailsState } from './piMessageDetailsState';

export function PiMessageDetailsBridge({
  messageId,
  onStateChange,
}: {
  messageId: string;
  onStateChange: (state: PiMessageDetailsState) => void;
}) {
  const data = useQueryParam('data');
  const lookupData = useMemo(() => parseMessageLookupData(data), [data]);
  const { hasRun, isError, isFetching, message, isMessageFound } = usePiChainMessageQuery({
    messageId,
    lookupData,
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
