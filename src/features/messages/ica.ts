import { useQuery } from '@tanstack/react-query';
import { BigNumber, utils } from 'ethers';

import { InterchainAccountRouter__factory } from '@hyperlane-xyz/core';
import {
  DomainIdToChainName,
  chainConnectionConfigs,
  hyperlaneCoreAddresses,
} from '@hyperlane-xyz/sdk';

import { areAddressesEqual, isValidAddress } from '../../utils/addresses';
import { logger } from '../../utils/logger';

// This assumes all chains have the same ICA address
const ICA_ADDRESS = Object.values(hyperlaneCoreAddresses)[0].interchainAccountRouter;

export function isIcaMessage({
  sender,
  recipient,
  hash,
}: {
  sender: string;
  recipient: string;
  hash?: string;
}) {
  const isSenderIca = isAddressIcaRouter(sender);
  const isRecipIca = isAddressIcaRouter(recipient);
  if (isSenderIca && isRecipIca) return true;
  if (isSenderIca && !isRecipIca) {
    logger.warn('Msg sender is ICA router but not recip', sender, recipient, hash);
  }
  if (!isSenderIca && isRecipIca) {
    logger.warn('Msg recip is ICA router but not sender', recipient, sender, hash);
  }
  return false;
}

function isAddressIcaRouter(addr: string) {
  return areAddressesEqual(addr, ICA_ADDRESS);
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

// TODO do this on backend and use private RPC
export async function tryFetchIcaAddress(originDomainId: number, senderAddress: string) {
  try {
    logger.debug('Fetching Ica address', originDomainId, senderAddress);
    const chainName = DomainIdToChainName[originDomainId];
    const connection = chainConnectionConfigs[chainName];
    if (!connection) throw new Error(`No connection info for ${chainName}`);
    const icaContract = InterchainAccountRouter__factory.connect(ICA_ADDRESS, connection.provider);
    const icaAddress = await icaContract.getInterchainAccount(originDomainId, senderAddress);
    if (!isValidAddress(icaAddress)) throw new Error(`Invalid Ica addr ${icaAddress}`);
    logger.debug('Ica address found', icaAddress);
    return icaAddress;
  } catch (error) {
    logger.error('Error fetching ICA address', error);
    return null;
  }
}

export function useIcaAddress(originDomainId: number, senderAddress?: string | null) {
  return useQuery(
    ['messageIcaAddress', originDomainId, senderAddress],
    () => {
      if (!originDomainId || !senderAddress || BigNumber.from(senderAddress).isZero()) return null;
      return tryFetchIcaAddress(originDomainId, senderAddress);
    },
    { retry: false },
  );
}
