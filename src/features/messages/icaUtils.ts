import { eqAddress, isValidAddress } from '@hyperlane-xyz/utils';
import { BigNumber, utils } from 'ethers';
import { useMemo } from 'react';

import { logger } from '../../utils/logger';

// This assumes all chains have the same ICA address
// const ICA_ADDRESS = hyperlaneEnvironments.mainnet.ethereum.interchainAccountRouter;
// TODO V3 determine what ICA address should be
export const ICA_ADDRESS = '';

export function useIsIcaMessage({ sender, recipient }: { sender: Address; recipient: Address }) {
  return useMemo(() => isIcaMessage({ sender, recipient }), [sender, recipient]);
}

export function isIcaMessage({ sender, recipient }: { sender: Address; recipient: Address }) {
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

export function tryDecodeIcaBody(body: string) {
  try {
    if (!body || BigNumber.from(body).isZero()) return null;
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

function isAddressIcaRouter(addr: Address) {
  try {
    // TODO PI support
    return ICA_ADDRESS && eqAddress(addr, ICA_ADDRESS);
  } catch (error) {
    logger.warn('Error checking if address is ICA router', error, addr);
    return false;
  }
}
