import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { toast } from 'react-toastify';

import { MultiProvider } from '@hyperlane-xyz/sdk';
import { errorToString } from '@hyperlane-xyz/utils';

import { useReadyMultiProvider, useRegistry, useStore } from '../../store';
import { Message, MessageStatus } from '../../types';
import { logger } from '../../utils/logger';
import { MissingChainConfigToast } from '../chains/MissingChainConfigToast';
import { isEvmChain } from '../chains/utils';

import { fetchDeliveryStatus } from './fetchDeliveryStatus';

export function useMessageDeliveryStatus({
  message,
  enabled = true,
}: {
  message: Message;
  enabled: boolean;
}) {
  const chainMetadataOverrides = useStore((s) => s.chainMetadataOverrides) || {};
  const multiProvider = useReadyMultiProvider();
  const registry = useRegistry();

  const { data, error, isFetching } = useQuery({
    queryKey: ['messageDeliveryStatus', message, !!multiProvider, registry, chainMetadataOverrides],
    queryFn: async () => {
      if (!multiProvider || message.status == MessageStatus.Delivered) {
        return { message };
      }

      const { id, originChainId, originDomainId, destinationChainId, destinationDomainId } =
        message;

      if (
        !checkChain(multiProvider, originChainId, originDomainId) ||
        !checkChain(multiProvider, destinationChainId, destinationDomainId)
      ) {
        return { message };
      }

      logger.debug('Fetching message delivery status for:', id);
      const deliverStatus = await fetchDeliveryStatus(
        multiProvider,
        registry,
        chainMetadataOverrides,
        message,
      );

      if (deliverStatus.status === MessageStatus.Delivered) {
        return {
          message: {
            ...message,
            status: MessageStatus.Delivered,
            destination: deliverStatus.deliveryTransaction,
          },
        };
      } else if (
        deliverStatus.status === MessageStatus.Failing ||
        deliverStatus.status === MessageStatus.Pending
      ) {
        return {
          message: {
            ...message,
            status: deliverStatus.status,
          },
          debugResult: deliverStatus.debugResult,
        };
      } else {
        return { message };
      }
    },
    retry: false,
    refetchInterval: (query) =>
      query.state.data?.message.status === MessageStatus.Delivered ? false : 10_000,
    enabled,
  });

  // Show toast on error
  useEffect(() => {
    if (error) {
      logger.error('Error fetching delivery status', error);
      toast.error(errorToString(error, 150));
    }
  }, [error]);

  return {
    messageWithDeliveryStatus: data?.message || message,
    debugResult: data?.debugResult,
    isDeliveryStatusFetching: isFetching,
  };
}

function checkChain(multiProvider: MultiProvider, chainId: ChainId, domainId: number) {
  if (!multiProvider.hasChain(chainId)) {
    toast.error(<MissingChainConfigToast chainId={chainId} domainId={domainId} />);
    return false;
  }
  if (!isEvmChain(multiProvider, chainId)) {
    logger.debug('Skipping delivery status check for non-EVM chain:', chainId);
    return false;
  }
  return true;
}
