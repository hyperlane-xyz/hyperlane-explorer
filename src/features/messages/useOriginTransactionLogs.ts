import { ProtocolType } from '@hyperlane-xyz/utils';
import { skipToken, useQuery } from '@tanstack/react-query';
import type { providers } from 'ethers';

import type { MessageStub } from '../../types';
import type { ExplorerMultiProvider } from '../hyperlane/sdkRuntime';

export type OriginTransactionLog = Pick<providers.Log, 'address' | 'topics' | 'data'>;

export function useOriginTransactionLogs<T = OriginTransactionLog[]>(
  message: Pick<MessageStub, 'originDomainId' | 'origin'>,
  multiProvider: ExplorerMultiProvider | undefined,
  providerVersion: number,
  protocol: ProtocolType.Ethereum | ProtocolType.Tron | undefined,
  select?: (logs: OriginTransactionLog[]) => T,
) {
  const { originDomainId, origin } = message;
  return useQuery({
    queryKey: ['originTransactionLogs', originDomainId, origin.hash, providerVersion, protocol],
    queryFn:
      multiProvider && protocol && origin.hash
        ? async () => {
            const provider =
              protocol === ProtocolType.Tron
                ? multiProvider.getTronProvider(originDomainId)
                : multiProvider.getEthersV5Provider(originDomainId);
            const receipt = await provider.getTransactionReceipt(origin.hash);
            if (!receipt) throw new Error(`No receipt for tx ${origin.hash}`);
            return receipt.logs;
          }
        : skipToken,
    select,
    staleTime: Infinity,
  });
}
