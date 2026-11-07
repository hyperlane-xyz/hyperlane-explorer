import { ProtocolType, timeout } from '@hyperlane-xyz/utils';
import { skipToken, useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';

import { useMultiProviderVersion, useReadyMultiProvider } from '../../../store';
import type { MessageStub } from '../../../types';
import { logger } from '../../../utils/logger';
import type { OriginConfirmation } from './useOriginConfirmation';

export interface OriginConfirmationTimestamp {
  blockNumber: number;
  timestamp: number;
}

/** Provider-backed: keep this inside MessageDetailsRuntime, outside the metadata shell. */
export function useOriginConfirmationTimestamp(
  message: MessageStub,
  confirmation?: OriginConfirmation,
): OriginConfirmationTimestamp | undefined {
  const multiProvider = useReadyMultiProvider();
  const providerVersion = useMultiProviderVersion();
  const protocol = multiProvider?.tryGetProtocol(message.originDomainId);
  const blockNumber = confirmation?.blockNumber;
  const canQuery =
    confirmation?.confirmed &&
    confirmation.required !== undefined &&
    confirmation.required > 0 &&
    blockNumber !== undefined &&
    (protocol === ProtocolType.Ethereum || protocol === ProtocolType.Tron);
  const { data, error } = useQuery({
    queryKey: [
      'originConfirmationTimestamp',
      message.originDomainId,
      message.origin.hash,
      'blockHash' in message.origin ? message.origin.blockHash : undefined,
      message.origin.timestamp,
      blockNumber,
      providerVersion,
    ],
    queryFn:
      canQuery && multiProvider && blockNumber !== undefined
        ? async () => {
            const provider =
              protocol === ProtocolType.Tron
                ? multiProvider.getTronProvider(message.originDomainId)
                : multiProvider.getEthersV5Provider(message.originDomainId);
            const block = await timeout(
              provider.getBlock(blockNumber),
              10_000,
              'Origin confirmation block lookup timed out',
            );
            if (!block || !Number.isFinite(block.timestamp) || block.timestamp <= 0) {
              throw new Error(`No timestamp for origin confirmation block ${blockNumber}`);
            }
            return { blockNumber, timestamp: block.timestamp * 1000 };
          }
        : skipToken,
    staleTime: Infinity,
    retry: 1,
    refetchOnWindowFocus: false,
  });
  useEffect(() => {
    if (error) logger.warn('Could not fetch origin confirmation block timestamp', error);
  }, [error]);
  return canQuery ? data : undefined;
}
