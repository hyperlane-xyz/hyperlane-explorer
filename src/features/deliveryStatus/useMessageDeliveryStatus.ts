import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { toast } from 'react-toastify';

import { chainIdToMetadata } from '@hyperlane-xyz/sdk';

import { useMultiProvider } from '../../multiProvider';
import { Message, MessageStatus } from '../../types';
import { logger } from '../../utils/logger';

import { fetchDeliveryStatus } from './fetchDeliveryStatus';

export function useMessageDeliveryStatus({ message, pause }: { message: Message; pause: boolean }) {
  const multiProvider = useMultiProvider();
  const serializedMessage = JSON.stringify(message);
  const { data, error } = useQuery(
    ['messageDeliveryStatus', serializedMessage, pause],
    async () => {
      // TODO enable PI support here
      if (
        pause ||
        !message ||
        message.status === MessageStatus.Delivered ||
        message.isPiMsg ||
        !chainIdToMetadata[message.originChainId] ||
        !chainIdToMetadata[message.destinationChainId]
      )
        return null;

      logger.debug('Fetching message delivery status for:', message.id);
      const deliverStatus = await fetchDeliveryStatus(multiProvider, message);
      logger.debug('Message delivery status result', deliverStatus);
      return deliverStatus;
    },
    { retry: false },
  );

  // Show toast on error
  useEffect(() => {
    if (error) {
      logger.error('Error fetching delivery status', error);
      toast.error(`${error}`);
    }
  }, [error]);

  const [messageWithDeliveryStatus, debugInfo] = useMemo(() => {
    if (data?.status === MessageStatus.Delivered) {
      return [
        {
          ...message,
          status: MessageStatus.Delivered,
          destination: data.deliveryTransaction,
        },
      ];
    } else if (data?.status === MessageStatus.Failing) {
      return [
        {
          ...message,
          status: MessageStatus.Failing,
        },
        {
          status: data.debugStatus,
          details: data.debugDetails,
          originChainId: message.originChainId,
          originTxHash: message.origin.hash,
        },
      ];
    }
    return [message];
  }, [message, data]);

  return { messageWithDeliveryStatus, debugInfo };
}
