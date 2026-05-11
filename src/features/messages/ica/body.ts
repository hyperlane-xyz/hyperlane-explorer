import { bytes32ToAddress, strip0x } from '@hyperlane-xyz/utils';
import { BigNumber, utils } from 'ethers';

import { IcaCall } from '../../../types';
import { logger } from '../../../utils/logger';
import { DecodedIcaMessage, IcaMessageType } from './types';

/**
 * Decode an ICA message body.
 *
 * Message formats (from InterchainAccountMessage.sol):
 *
 * CALLS message:
 * - Byte 0: MessageType.CALLS (0x00)
 * - Bytes 1-33: ICA owner (bytes32)
 * - Bytes 33-65: ICA ISM (bytes32)
 * - Bytes 65-97: User Salt (bytes32)
 * - Bytes 97+: ABI-encoded Call[] where Call = (bytes32 to, uint256 value, bytes data)
 *
 * COMMITMENT message:
 * - Byte 0: MessageType.COMMITMENT (0x01)
 * - Bytes 1-33: ICA owner (bytes32)
 * - Bytes 33-65: ICA ISM (bytes32)
 * - Bytes 65-97: User Salt (bytes32)
 * - Bytes 97-129: Commitment (bytes32)
 *
 * REVEAL message:
 * - Byte 0: MessageType.REVEAL (0x02)
 * - Bytes 1-33: ICA ISM (bytes32)
 * - Bytes 33-65: Commitment (bytes32)
 */
export function decodeIcaBody(body: string): DecodedIcaMessage | null {
  if (!body) return null;

  try {
    const bodyHex = strip0x(body);

    // Safe zero check - handles any length payload without throwing
    if (!bodyHex || /^0*$/.test(bodyHex)) return null;

    // Minimum length to read message type: 1 byte = 2 hex chars
    if (bodyHex.length < 2) {
      logger.warn('ICA body too short to read message type');
      return null;
    }

    // Parse message type (first byte)
    const messageType = parseInt(bodyHex.slice(0, 2), 16) as IcaMessageType;

    if (messageType === IcaMessageType.REVEAL) {
      // REVEAL format: type (1) + ism (32) + commitment (32) = 65 bytes = 130 hex chars
      if (bodyHex.length < 130) {
        logger.warn('REVEAL message body too short');
        return null;
      }

      const revealIsm = bytes32ToAddress('0x' + bodyHex.slice(2, 66));
      const revealCommitment = '0x' + bodyHex.slice(66, 130);

      return {
        messageType,
        owner: '', // Not present in REVEAL
        ism: revealIsm,
        salt: '', // Not present in REVEAL
        calls: [],
        commitment: revealCommitment,
      };
    }

    // CALLS and COMMITMENT messages have the same prefix format
    // Minimum length: 1 byte type + 32 bytes owner + 32 bytes ism + 32 bytes salt = 97 bytes = 194 hex chars
    if (bodyHex.length < 194) {
      logger.warn('ICA CALLS/COMMITMENT body too short');
      return null;
    }

    // Parse owner (bytes 1-33)
    const ownerBytes32 = '0x' + bodyHex.slice(2, 66);
    const owner = bytes32ToAddress(ownerBytes32);

    // Parse ISM (bytes 33-65)
    const ismBytes32 = '0x' + bodyHex.slice(66, 130);
    const ism = bytes32ToAddress(ismBytes32);

    // Parse salt (bytes 65-97)
    const salt = '0x' + bodyHex.slice(130, 194);

    if (messageType === IcaMessageType.CALLS) {
      // Decode the ABI-encoded calls array (bytes 97+)
      const encodedCalls = '0x' + bodyHex.slice(194);

      // Format: (bytes32 to, uint256 value, bytes data)[]
      const decoded = utils.defaultAbiCoder.decode(
        ['tuple(bytes32 to, uint256 value, bytes data)[]'],
        encodedCalls,
      );

      const rawCalls = decoded[0] as Array<{
        to: string;
        value: BigNumber;
        data: string;
      }>;

      const calls: IcaCall[] = rawCalls.map((call) => ({
        to: bytes32ToAddress(call.to),
        value: call.value.toString(),
        data: call.data,
      }));

      return { messageType, owner, ism, salt, calls };
    } else if (messageType === IcaMessageType.COMMITMENT) {
      // Commitment is bytes 97-129
      if (bodyHex.length < 258) {
        logger.warn('COMMITMENT message body too short for commitment hash');
        return null;
      }
      const commitment = '0x' + bodyHex.slice(194, 258);
      return { messageType, owner, ism, salt, calls: [], commitment };
    }

    // Unknown message type
    logger.warn('Unknown ICA message type:', messageType);
    return null;
  } catch (error) {
    logger.error('Error decoding ICA body', error);
    return null;
  }
}

/**
 * Decode the ISM metadata for a REVEAL message to extract the calls.
 *
 * Metadata format (from CommitmentReadIsm.verify):
 * - Bytes 0-20: ICA address
 * - Bytes 20-52: Salt (bytes32)
 * - Bytes 52+: ABI-encoded CallLib.Call[]
 */
export function decodeRevealMetadata(metadata: string): {
  icaAddress: string;
  salt: string;
  calls: IcaCall[];
} | null {
  try {
    const metaHex = strip0x(metadata);

    // Minimum: 20 bytes address + 32 bytes salt = 52 bytes = 104 hex chars
    if (metaHex.length < 104) {
      return null;
    }

    // ICA address (bytes 0-20)
    const icaAddress = '0x' + metaHex.slice(0, 40);

    // Salt (bytes 20-52)
    const salt = '0x' + metaHex.slice(40, 104);

    // Calls (bytes 52+)
    const encodedCalls = '0x' + metaHex.slice(104);

    const decoded = utils.defaultAbiCoder.decode(
      ['tuple(bytes32 to, uint256 value, bytes data)[]'],
      encodedCalls,
    );

    const rawCalls = decoded[0] as Array<{
      to: string;
      value: BigNumber;
      data: string;
    }>;

    const calls: IcaCall[] = rawCalls.map((call) => ({
      to: bytes32ToAddress(call.to),
      value: call.value.toString(),
      data: call.data,
    }));

    return { icaAddress, salt, calls };
  } catch (error) {
    logger.error('Error decoding reveal metadata', error);
    return null;
  }
}
