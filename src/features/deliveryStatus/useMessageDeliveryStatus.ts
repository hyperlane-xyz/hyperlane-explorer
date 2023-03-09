import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { toast } from 'react-toastify';

import { Message, MessageStatus } from '../../types';
import { logger } from '../../utils/logger';

import type { MessageDeliveryStatusResponse } from './types';

// TODO: Deprecate this to simplify message details page
export function useMessageDeliveryStatus(message: Message, isReady: boolean) {
  const serializedMessage = JSON.stringify(message);
  const queryResult = useQuery(
    ['messageProcessTx', serializedMessage, isReady],
    async () => {
      if (!isReady || !message || message.status === MessageStatus.Delivered || message.isPiMsg)
        return null;

      const response = await fetch('/api/delivery-status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: serializedMessage,
      });
      if (!response.ok) {
        const errorMsg = await response.text();
        throw new Error(errorMsg);
      }
      const result = (await response.json()) as MessageDeliveryStatusResponse;
      logger.debug('Message delivery status result', result);
      return result;
    },
    { retry: false },
  );

  // Show toast on error
  const error = queryResult.error;
  useEffect(() => {
    if (error) {
      logger.error('Error fetching delivery status', error);
      toast.error(`${error}`);
    }
  }, [error]);
  return queryResult;
}
