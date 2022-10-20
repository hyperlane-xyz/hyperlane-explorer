import { useQuery } from '@tanstack/react-query';
import { logger } from 'ethers';

import type { Message } from '../../types';

import type { MessageDeliveryStatusResponse } from './types';

export function useMessageDeliveryStatus(message: Message, isReady: boolean) {
  const serializedMessage = JSON.stringify(message);
  return useQuery(
    ['messageProcessTx', serializedMessage, isReady],
    async () => {
      if (!message || !isReady) return null;

      // TODO type this
      const response = await fetch('/api/delivery-status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: serializedMessage,
      });
      if (!response.ok) throw new Error('Message status response not okay');
      const result = (await response.json()) as MessageDeliveryStatusResponse;
      logger.debug('Message delivery status result', result);
      return result;
    },
    { retry: false },
  );
}
