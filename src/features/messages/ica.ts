import { useQuery } from '@tanstack/react-query';
import { BigNumber, providers, utils } from 'ethers';

import { InterchainAccountRouter__factory } from '@hyperlane-xyz/core';
import { hyperlaneEnvironments } from '@hyperlane-xyz/sdk';

import { useMultiProvider } from '../../multiProvider';
import { areAddressesEqual, isValidAddress } from '../../utils/addresses';
import { logger } from '../../utils/logger';

// This assumes all chains have the same ICA address
const ICA_ADDRESS = hyperlaneEnvironments.mainnet.ethereum.interchainAccountRouter;

export function isIcaMessage({
  sender,
  recipient,
}: {
  sender: Address;
  recipient: Address;
  hash?: string;
}) {
  const isSenderIca = isAddressIcaRouter(sender);
  const isRecipIca = isAddressIcaRouter(recipient);
  if (isSenderIca && isRecipIca) return true;
  if (isSenderIca && !isRecipIca) {
    logger.warn('Msg sender is ICA router but not recip', sender, recipient);
  }
  if (!isSenderIca && isRecipIca) {
    logger.warn('Msg recip is ICA router but not sender', recipient, sender);
  }
  return false;
}

function isAddressIcaRouter(addr: Address) {
  // TODO PI support
  return ICA_ADDRESS && areAddressesEqual(addr, ICA_ADDRESS);
}

export function tryDecodeIcaBody(body: string) {
  if (!body || BigNumber.from(body).isZero()) return null;
  try {
    const decoder = utils.defaultAbiCoder;
    const decodedBody = decoder.decode(['address sender', 'tuple(address, bytes)[] calls'], body);
    const { sender, calls } = decodedBody as unknown as {
      sender: string;
      calls: Array<[string, string]>;
    };
    if (typeof sender !== 'string' || !isValidAddress(sender))
      throw new Error(`Invalid sender address: ${sender}`);
    if (!Array.isArray(calls)) throw new Error(`Invalid call list: ${JSON.stringify(calls)}`);

    const formattedCalls = calls.map((c) => {
      const [destinationAddress, callBytes] = c;
      if (typeof destinationAddress !== 'string' || !isValidAddress(destinationAddress))
        throw new Error(`Invalid call dest address: ${destinationAddress}`);
      if (typeof callBytes !== 'string') throw new Error(`Invalid call bytes: ${callBytes}`);
      return {
        destinationAddress,
        callBytes,
      };
    });

    return {
      sender,
      calls: formattedCalls,
    };
  } catch (error) {
    logger.error('Error decoding ICA body', error);
    return null;
  }
}

export async function tryFetchIcaAddress(
  originDomainId: DomainId,
  sender: Address,
  provider: providers.Provider,
) {
  try {
    if (!ICA_ADDRESS) return null;
    logger.debug('Fetching Ica address', originDomainId, sender);

    const icaContract = InterchainAccountRouter__factory.connect(ICA_ADDRESS, provider);
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
  const multiProvider = useMultiProvider();
  return useQuery(
    ['useIcaAddress', originDomainId, sender],
    () => {
      if (!originDomainId || !sender || BigNumber.from(sender).isZero()) return null;
      const provider = multiProvider.tryGetProvider(originDomainId);
      if (!provider) return null;
      return tryFetchIcaAddress(originDomainId, sender, provider);
    },
    { retry: false },
  );
}
