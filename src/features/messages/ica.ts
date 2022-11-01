import { BigNumber, utils } from 'ethers';

import { hyperlaneCoreAddresses } from '@hyperlane-xyz/sdk';

import { Message } from '../../types';
import { areAddressesEqual, isValidAddress } from '../../utils/addresses';
import { logger } from '../../utils/logger';

// This assumes all chains have the same ICA address
const ICA_ADDRESS = Object.values(hyperlaneCoreAddresses)[0].interchainAccountRouter;

export function isIcaMessage({ hash, sender, recipient }: Message) {
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

export function decodeIcaBody(body: string) {
  if (!body || BigNumber.from(body).isZero()) return null;
  try {
    const decoder = utils.defaultAbiCoder;
    const decodedBody = decoder.decode(['address sender', 'tuple(address, bytes)[] calls'], body);
    const { sender, calls } = decodedBody as unknown as {
      sender: string;
      calls: Array<[string, string]>;
    };
    if (typeof sender !== 'string' || !isValidAddress(sender)) {
      throw new Error(`Invalid sender address: ${sender}`);
    }
    if (!Array.isArray(calls)) {
      throw new Error(`Invalid call list: ${JSON.stringify(calls)}`);
    }

    const formattedCalls = calls.map((c) => {
      const [destinationAddress, callBytes] = c;
      if (typeof destinationAddress !== 'string' || !isValidAddress(destinationAddress)) {
        throw new Error(`Invalid call dest address: ${destinationAddress}`);
      }
      if (typeof callBytes !== 'string') {
        throw new Error(`Invalid call bytes: ${callBytes}`);
      }
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
