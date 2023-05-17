import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { toast } from 'react-toastify';

import { Message, MessageStatus } from '../../types';
import { errorToString } from '../../utils/errors';
import { logger } from '../../utils/logger';
import { MissingChainConfigToast } from '../chains/MissingChainConfigToast';
import { useChainConfigs } from '../chains/useChainConfigs';
import { useMultiProvider } from '../providers/multiProvider';

import { fetchDeliveryStatus } from './fetchDeliveryStatus';

export function useMessageDeliveryStatus({ message, pause }: { message: Message; pause: boolean }) {
  const chainConfigs = useChainConfigs();
  const multiProvider = useMultiProvider();

  const serializedMessage = JSON.stringify(message);
  const { data, error, isFetching } = useQuery(
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
      return deliverStatus;
    },
    { retry: false },
  );

  // Show toast on error
  useEffect(() => {
    if (error) {
      logger.error('Error fetching delivery status', error);
      toast.error(errorToString(error, 150));
    }
  }, [error]);

  const [messageWithDeliveryStatus, debugResult] = useMemo(() => {
    if (data?.status === MessageStatus.Delivered) {
      return [
        {
          ...message,
          status: MessageStatus.Delivered,
          destination: data.deliveryTransaction,
        },
      ];
    } else if (data?.status === MessageStatus.Failing || data?.status === MessageStatus.Pending) {
      return [
        {
          ...message,
          status: data.status,
        },
        data.debugResult,
      ];
    } else {
      return [message];
    }
  }, [message, data]);

  return { messageWithDeliveryStatus, debugResult, isDeliveryStatusFetching: isFetching };
}
