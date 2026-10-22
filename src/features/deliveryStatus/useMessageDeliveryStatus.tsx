import { errorToString } from '@hyperlane-xyz/utils';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { toast } from 'react-toastify';

import { useMultiProviderVersion, useReadyMultiProvider, useRegistry, useStore } from '../../store';
import { Message, MessageStatus, MessageStub } from '../../types';
import { logger } from '../../utils/logger';
import { MissingChainConfigToast } from '../chains/MissingChainConfigToast';
import { isEvmChain } from '../chains/utils';
import type { ExplorerMultiProvider as MultiProtocolProvider } from '../hyperlane/sdkRuntime';
import { useIsMessageLive } from '../messages/queries/useLiveMessages';
import { getDeliveryStatusRefetchInterval } from './deliveryStatusPolling';

export function useMessageDeliveryStatus({
  message,
  enabled = true,
}: {
  message: Message | MessageStub;
  enabled: boolean;
}) {
  const chainMetadataOverrides = useStore((s) => s.chainMetadataOverrides) || {};
  const multiProvider = useReadyMultiProvider();
  const multiProviderVersion = useMultiProviderVersion();
  const registry = useRegistry();
  const isMessageLive = useIsMessageLive(message);
  const queryMessage = { ...message, liveReceivedAt: undefined };

  const { data, error, isFetching } = useQuery({
    queryKey: [
      'messageDeliveryStatus',
      queryMessage,
      multiProviderVersion,
      registry,
      chainMetadataOverrides,
    ],
    queryFn: async () => {
      const hasDeliveredDetails =
        message.status === MessageStatus.Delivered &&
        message.destination?.blockNumber !== undefined;

      if (!multiProvider || hasDeliveredDetails) {
        return { message };
      }

      const { id, originDomainId, destinationDomainId } = message;

      if (
        !checkChain(multiProvider, originDomainId) ||
        !checkChain(multiProvider, destinationDomainId)
      ) {
        return { message };
      }

      logger.debug('Fetching message delivery status for:', id);
      const { fetchDeliveryStatus } = await import('./fetchDeliveryStatus');
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
      }
      return {
        message: { ...message, status: deliverStatus.status },
        debugResult: deliverStatus.debugResult,
      };
    },
    retry: false,
    refetchInterval: (query) =>
      getDeliveryStatusRefetchInterval(
        query.state.data?.message.status === MessageStatus.Delivered,
        message.isPiMsg,
        isMessageLive ? 'connected' : 'disconnected',
      ),
    enabled: enabled && !!multiProvider,
  });

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

function checkChain(multiProvider: MultiProtocolProvider, domainId: number) {
  if (!multiProvider.hasChain(domainId)) {
    toast.error(<MissingChainConfigToast domainId={domainId} />);
    return false;
  }
  if (!isEvmChain(multiProvider, domainId)) {
    logger.debug('Skipping delivery status check for non-EVM chain:', domainId);
    return false;
  }
  return true;
}
