import type { IRegistry } from '@hyperlane-xyz/registry';
import type { ChainMap, ChainMetadata } from '@hyperlane-xyz/sdk';
import { errorToString } from '@hyperlane-xyz/utils';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { toast } from 'react-toastify';

import { useReadyMultiProvider, useRegistry, useStore } from '../../store';
import { Message, MessageStatus, MessageStub } from '../../types';
import { logger } from '../../utils/logger';
import { MissingChainConfigToast } from '../chains/MissingChainConfigToast';
import { isEvmChain } from '../chains/utils';
import type { ExplorerMultiProvider as MultiProtocolProvider } from '../hyperlane/sdkRuntime';

type DeliveryStatusQueryMessage = MessageStub &
  Partial<Pick<Message, 'decodedBody' | 'totalGasAmount' | 'totalPayment' | 'numPayments'>>;
type DeliveryStatusQueryKey = readonly [
  'messageDeliveryStatus',
  DeliveryStatusQueryMessage,
  boolean,
  IRegistry,
  ChainMap<Partial<ChainMetadata>>,
];

export function useMessageDeliveryStatus({
  message,
  enabled = true,
}: {
  message: Message | MessageStub;
  enabled: boolean;
}) {
  const chainMetadataOverrides = useStore((s) => s.chainMetadataOverrides) || {};
  const multiProvider = useReadyMultiProvider();
  const registry = useRegistry();
  const queryMessage = createDeliveryStatusQueryMessage(message);

  const { data, error, isFetching } = useQuery({
    queryKey: [
      'messageDeliveryStatus',
      queryMessage,
      !!multiProvider,
      registry,
      chainMetadataOverrides,
    ] as DeliveryStatusQueryKey,
    queryFn: async ({ queryKey }) => {
      const [, messageForQuery] = queryKey;
      const hasDeliveredDetails =
        messageForQuery.status === MessageStatus.Delivered &&
        !!messageForQuery.destination &&
        'blockNumber' in messageForQuery.destination;

      if (!multiProvider || hasDeliveredDetails) {
        return { message: messageForQuery };
      }

      const { id, originDomainId, destinationDomainId } = messageForQuery;

      if (
        !checkChain(multiProvider, originDomainId) ||
        !checkChain(multiProvider, destinationDomainId)
      ) {
        return { message: messageForQuery };
      }

      logger.debug('Fetching message delivery status for:', id);
      const { fetchDeliveryStatus } = await import('./fetchDeliveryStatus');
      const deliverStatus = await fetchDeliveryStatus(
        multiProvider,
        registry,
        chainMetadataOverrides,
        messageForQuery,
      );

      if (deliverStatus.status === MessageStatus.Delivered) {
        return {
          message: {
            ...messageForQuery,
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
            ...messageForQuery,
            status: deliverStatus.status,
          },
          debugResult: deliverStatus.debugResult,
        };
      } else {
        return { message: messageForQuery };
      }
    },
    retry: false,
    refetchInterval: (query) =>
      query.state.data?.message.status === MessageStatus.Delivered ? false : 10_000,
    enabled,
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

function createDeliveryStatusQueryMessage(
  message: Message | MessageStub,
): DeliveryStatusQueryMessage {
  return {
    ...message,
    origin: { ...message.origin },
    destination: message.destination ? { ...message.destination } : undefined,
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
