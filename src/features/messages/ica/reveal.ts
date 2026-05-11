import { utils } from 'ethers';

import { IcaCall } from '../../../types';
import { logger } from '../../../utils/logger';
import type { ExplorerMultiProvider } from '../../hyperlane/sdkRuntime';
import { decodeRevealMetadata } from './body';
import { getMailboxAddress, isMulticallAddress, tryDecodeMulticallCalls } from './multicall';

/**
 * Try to extract process calls from a multicall transaction.
 * Supports various Multicall contract formats (Multicall3, etc.)
 */
function tryDecodeMulticall(
  txData: string,
  mailboxInterface: utils.Interface,
  mailboxAddress: string | undefined,
): Array<{ metadata: string; message: string }> {
  const results: Array<{ metadata: string; message: string }> = [];
  if (!mailboxAddress) return results;
  const mailboxLower = mailboxAddress.toLowerCase();

  const tryParseProcessCall = (target: string, callData: string) => {
    if (target.toLowerCase() !== mailboxLower) return;
    try {
      const parsed = mailboxInterface.parseTransaction({ data: callData });
      if (parsed.name === 'process') {
        results.push({
          metadata: parsed.args[0] as string,
          message: parsed.args[1] as string,
        });
      }
    } catch {
      // Not a process call, continue
    }
  };

  try {
    const calls = tryDecodeMulticallCalls(txData);
    if (!calls) return results;
    for (const call of calls) tryParseProcessCall(call.to, call.data);
    return results;
  } catch (error) {
    logger.debug('Failed to decode multicall', error);
  }

  return results;
}

/**
 * Fetch the calls for a REVEAL message by parsing the process transaction.
 * The calls are passed as ISM metadata to the mailbox.process() function.
 * Handles both direct process calls to the mailbox and multicall batches.
 */
export async function fetchRevealCalls(
  destinationChainName: string,
  processTxHash: string,
  messageId: string,
  multiProvider: ExplorerMultiProvider,
): Promise<IcaCall[] | null> {
  try {
    const provider = multiProvider.getEthersV5Provider(destinationChainName);
    const tx = await provider.getTransaction(processTxHash);

    if (!tx || !tx.data || !tx.to) {
      logger.debug('Transaction not found or has no data/to address');
      return null;
    }

    // eslint-disable-next-line camelcase
    const { Mailbox__factory } = await import('@hyperlane-xyz/core');
    // eslint-disable-next-line camelcase
    const mailboxInterface = Mailbox__factory.createInterface();

    const mailboxAddress = getMailboxAddress(destinationChainName);
    const txTo = tx.to.toLowerCase();

    // Check if this is a direct call to the mailbox
    if (mailboxAddress && txTo === mailboxAddress.toLowerCase()) {
      logger.debug('Direct process call to mailbox detected');
      try {
        const decoded = mailboxInterface.parseTransaction({ data: tx.data });

        if (decoded.name === 'process') {
          const metadata = decoded.args[0] as string;
          const revealData = decodeRevealMetadata(metadata);

          if (revealData) {
            return revealData.calls;
          }
        }
      } catch {
        logger.debug('Failed to decode direct process call');
      }
      return null;
    }

    // Check if this is a multicall transaction
    if (isMulticallAddress(tx.to, destinationChainName)) {
      logger.debug('Multicall transaction detected');
      const processCalls = tryDecodeMulticall(tx.data, mailboxInterface, mailboxAddress);

      if (processCalls.length > 0) {
        // Find the process call that matches our message ID
        const { messageId: computeMessageId } = await import('@hyperlane-xyz/utils');

        for (const processCall of processCalls) {
          try {
            const msgId = computeMessageId(processCall.message);
            if (msgId.toLowerCase() === messageId.toLowerCase()) {
              const revealData = decodeRevealMetadata(processCall.metadata);
              if (revealData) {
                return revealData.calls;
              }
            }
          } catch {
            // Failed to compute message ID, continue
          }
        }

        // If we couldn't match by message ID, return null to avoid showing potentially incorrect data
        // (the first process call might belong to a different message in a batched transaction)
        logger.debug('Could not match message ID, calls unavailable');
      }
      return null;
    }

    // Unknown destination contract - try both approaches as fallback
    logger.debug('Unknown destination contract, trying fallback decoding');

    // Try direct process call first
    try {
      const decoded = mailboxInterface.parseTransaction({ data: tx.data });
      if (decoded.name === 'process') {
        const metadata = decoded.args[0] as string;
        const revealData = decodeRevealMetadata(metadata);
        if (revealData) {
          return revealData.calls;
        }
      }
    } catch {
      // Not a direct process call
    }

    // Try multicall decode
    const processCalls = tryDecodeMulticall(tx.data, mailboxInterface, mailboxAddress);
    if (processCalls.length > 0) {
      const { messageId: computeMessageId } = await import('@hyperlane-xyz/utils');

      for (const processCall of processCalls) {
        try {
          const msgId = computeMessageId(processCall.message);
          if (msgId.toLowerCase() === messageId.toLowerCase()) {
            const revealData = decodeRevealMetadata(processCall.metadata);
            if (revealData) {
              return revealData.calls;
            }
          }
        } catch {
          // Failed to compute message ID, continue
        }
      }
    }

    return null;
  } catch (error) {
    logger.error('Error fetching reveal calls', error);
    return null;
  }
}
