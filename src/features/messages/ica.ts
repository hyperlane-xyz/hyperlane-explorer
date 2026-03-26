import { InterchainAccountRouter__factory as InterchainAccountRouterFactory } from '@hyperlane-xyz/core';
import { isValidAddress } from '@hyperlane-xyz/utils';
import { useQuery } from '@tanstack/react-query';
import { BigNumber, providers } from 'ethers';

import { useReadyMultiProvider } from '../../store';
import { logger } from '../../utils/logger';
import { ICA_ADDRESS } from './icaUtils';

export { ICA_ADDRESS, isIcaMessage, tryDecodeIcaBody, useIsIcaMessage } from './icaUtils';

export async function tryFetchIcaAddress(
  originDomainId: DomainId,
  sender: Address,
  provider: providers.Provider,
) {
  try {
    if (!ICA_ADDRESS) return null;
    logger.debug('Fetching Ica address', originDomainId, sender);

    const icaContract = InterchainAccountRouterFactory.connect(ICA_ADDRESS, provider);
    const icaAddress = await icaContract['getInterchainAccount(uint32,address)'](
      originDomainId,
      sender,
    );
    if (!isValidAddress(icaAddress)) throw new Error(`Invalid Ica addr ${icaAddress}`);
    logger.debug('Ica address found', icaAddress);
    return icaAddress;
  } catch (error) {
    logger.error('Error fetching ICA address', error);
    return null;
  }
}

export function useIcaAddress(originDomainId: DomainId, sender?: Address | null) {
  const multiProvider = useReadyMultiProvider();
  return useQuery({
    queryKey: ['useIcaAddress', originDomainId, sender, !!multiProvider],
    queryFn: () => {
      if (!originDomainId || !multiProvider || !sender || BigNumber.from(sender).isZero())
        return null;
      try {
        const provider = multiProvider.getEthersV5Provider(originDomainId);
        return tryFetchIcaAddress(originDomainId, sender, provider);
      } catch (error) {
        logger.error('Error fetching ICA address', error);
        return null;
      }
    },
    retry: false,
  });
}
