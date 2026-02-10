/**
 * Hook to fetch ISM details from the backend API.
 * Uses the SDK's BaseMetadataBuilder for real validator signature status.
 */

import type { MetadataBuildResult } from '@hyperlane-xyz/sdk';
import { useQuery } from '@tanstack/react-query';
import { Message } from '../../types';
import { logger } from '../../utils/logger';

interface IsmDetailsResponse {
  result: MetadataBuildResult;
}

async function fetchIsmDetails(message: Message): Promise<MetadataBuildResult | null> {
  // Need the origin transaction hash
  if (!message.origin?.hash) {
    logger.warn('No origin transaction hash available');
    return null;
  }

  try {
    const response = await fetch('/api/ism-details', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        originTxHash: message.origin.hash,
        messageId: message.msgId,
        originDomain: message.originDomainId,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      logger.warn('Failed to fetch ISM details:', errorData);
      return null;
    }

    const data: IsmDetailsResponse = await response.json();
    return data.result;
  } catch (error) {
    logger.error('Error fetching ISM details:', error);
    return null;
  }
}

export function useIsmDetails(message: Message | null | undefined) {
  return useQuery({
    // Query key includes message ID and tx hash
    // eslint-disable-next-line @tanstack/query/exhaustive-deps
    queryKey: ['ismDetails', message?.msgId, message?.origin?.hash],
    queryFn: () => (message ? fetchIsmDetails(message) : null),
    enabled: !!message && !!message.origin?.hash,
    staleTime: 30 * 1000, // 30 seconds
    retry: 1,
  });
}
