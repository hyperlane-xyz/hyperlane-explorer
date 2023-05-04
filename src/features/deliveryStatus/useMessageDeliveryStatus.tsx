import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { toast } from 'react-toastify';

import { Message, MessageStatus } from '../../types';
import { logger } from '../../utils/logger';
import { MissingChainConfigToast } from '../chains/MissingChainConfigToast';
import { useChainConfigs } from '../chains/useChainConfigs';
import { useMultiProvider } from '../providers/multiProvider';

import { fetchDeliveryStatus } from './fetchDeliveryStatus';

export function useMessageDeliveryStatus({ message, pause }: { message: Message; pause: boolean }) {
  const chainConfigs = useChainConfigs();
  const multiProvider = useMultiProvider();

  const serializedMessage = JSON.stringify(message);
  const { data, error } = useQuery(
    ['messageDeliveryStatus', serializedMessage, pause],
    async () => {
      if (pause || !message || message.status === MessageStatus.Delivered) return null;

      if (!multiProvider.tryGetChainMetadata(message.originChainId)) {
        toast.error(
          <MissingChainConfigToast
            chainId={message.originChainId}
            domainId={message.originDomainId}
          />,
        );
        return null;
      } else if (!multiProvider.tryGetChainMetadata(message.destinationChainId)) {
        toast.error(
          <MissingChainConfigToast
            chainId={message.destinationChainId}
            domainId={message.destinationDomainId}
          />,
        );
        return null;
      }

      logger.debug('Fetching message delivery status for:', message.id);
      const deliverStatus = await fetchDeliveryStatus(multiProvider, chainConfigs, message);
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
        },
      ];
    }
    return [message];
  }, [message, data]);

  return { messageWithDeliveryStatus, debugInfo };
}
