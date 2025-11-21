import { Mailbox__factory } from '@hyperlane-xyz/core';
import { MultiProtocolProvider } from '@hyperlane-xyz/sdk';
import { messageId } from '@hyperlane-xyz/utils';

import { DELIVERY_LOG_CHECK_BLOCK_RANGE } from '../../../consts/values';
import { logger } from '../../../utils/logger';

/**
 * Extracts the Hyperlane message ID from a transaction that dispatched a message.
 * Parses the Dispatch event from the transaction receipt to get the message bytes,
 * then calculates the message ID from those bytes.
 */
export async function extractMessageIdFromTx(
  txHash: string,
  chainName: string,
  multiProvider: MultiProtocolProvider,
): Promise<string | null> {
  try {
    const provider = multiProvider.getEthersV5Provider(chainName);
    const txReceipt = await provider.getTransactionReceipt(txHash);
    if (!txReceipt) {
      logger.debug('No transaction receipt found', { txHash, chainName });
      return null;
    }

    // Get the mailbox address for this chain
    const chainMetadata = multiProvider.getChainMetadata(chainName) as any;
    const mailboxAddress = chainMetadata?.mailbox;
    if (!mailboxAddress) {
      logger.debug('No mailbox address configured for chain', { chainName });
      return null;
    }

    // Connect to the mailbox contract to parse events
    // eslint-disable-next-line camelcase
    const mailbox = Mailbox__factory.connect(mailboxAddress, provider);

    // Find the Dispatch event in the transaction logs
    for (const log of txReceipt.logs) {
      try {
        const parsedLog = mailbox.interface.parseLog(log);
        if (parsedLog.name === 'Dispatch') {
          // Extract message bytes from the Dispatch event
          const messageBytes = parsedLog.args['message'];
          // Calculate message ID from message bytes
          const msgId = messageId(messageBytes);
          logger.debug('Extracted message ID from tx', {
            txHash,
            messageId: msgId,
            chainName,
          });
          return msgId;
        }
      } catch {
        // Not a mailbox event, continue to next log
        continue;
      }
    }

    logger.debug('No Dispatch event found in transaction', { txHash, chainName });
    return null;
  } catch (error) {
    logger.error('Error extracting message ID from transaction', {
      error,
      txHash,
      chainName,
    });
    return null;
  }
}

/**
 * Checks if a Hyperlane message has been delivered on the destination chain.
 * Queries for ProcessId events on the destination mailbox, with a fallback to
 * calling the mailbox.delivered() method if logs are unreliable.
 *
 * @param msgId The Hyperlane message ID
 * @param destinationChainName The destination chain name or domain ID
 * @param mailboxAddr The mailbox address on the destination chain
 * @param multiProvider The multi-protocol provider
 * @param blockRange Optional block range to search (defaults to DELIVERY_LOG_CHECK_BLOCK_RANGE)
 * @returns Delivery status with optional transaction details
 */
export async function checkIsMessageDelivered(
  msgId: string,
  destinationChainName: string | number,
  mailboxAddr: Address,
  multiProvider: MultiProtocolProvider,
  blockRange?: number,
): Promise<{
  isDelivered: boolean;
  transactionHash?: string;
  blockNumber?: number;
}> {
  // Delivery checking is only supported for EVM chains
  const destMetadata = multiProvider.tryGetChainMetadata(destinationChainName);
  if (destMetadata?.protocol !== 'ethereum') {
    logger.debug('Skipping delivery check for non-EVM chain', { destinationChainName });
    return { isDelivered: false };
  }

  const provider = multiProvider.getEthersV5Provider(destinationChainName);
  // eslint-disable-next-line camelcase
  const mailbox = Mailbox__factory.connect(mailboxAddr, provider);

  // Try finding logs first as they have more info (tx hash, block number)
  try {
    logger.debug(`Searching for process logs for msgId ${msgId}`);
    const currentBlock = await provider.getBlockNumber();
    const fromBlock = currentBlock - (blockRange || DELIVERY_LOG_CHECK_BLOCK_RANGE);
    const logs = await mailbox.queryFilter(mailbox.filters.ProcessId(msgId), fromBlock, 'latest');
    if (logs?.length) {
      logger.debug(`Found process log for ${msgId}`);
      const log = logs[0]; // Should only be 1 log per message delivery
      return {
        isDelivered: true,
        transactionHash: log.transactionHash,
        blockNumber: log.blockNumber,
      };
    }
  } catch (error) {
    logger.warn(`Error querying for process logs for msgId ${msgId}`, error);
  }

  // Logs are unreliable so check the mailbox itself as a fallback
  logger.debug(`Querying mailbox about msgId ${msgId}`);
  const isDelivered = await mailbox.delivered(msgId);
  logger.debug(`Mailbox delivery status for ${msgId}: ${isDelivered}`);
  return { isDelivered };
}
