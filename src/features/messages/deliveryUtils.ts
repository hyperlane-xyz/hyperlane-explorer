import { Mailbox__factory as MailboxFactory } from '@hyperlane-xyz/core';
import { messageId } from '@hyperlane-xyz/utils';

import { DELIVERY_LOG_CHECK_BLOCK_RANGE } from '../../consts/values';
import { logger } from '../../utils/logger';
import type { ExplorerMultiProvider as MultiProtocolProvider } from '../hyperlane/sdkRuntime';

function getMailboxAddress(
  multiProvider: Pick<MultiProtocolProvider, 'tryGetChainMetadata'>,
  chainName: string,
): Address | undefined {
  const chainMetadata = multiProvider.tryGetChainMetadata(chainName) as
    | { mailbox?: Address }
    | null
    | undefined;
  return chainMetadata?.mailbox;
}

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

    const mailboxAddress = getMailboxAddress(multiProvider, chainName);
    if (!mailboxAddress) {
      logger.debug('No mailbox address configured for chain', { chainName });
      return null;
    }

    const mailbox = MailboxFactory.connect(mailboxAddress, provider);

    for (const log of txReceipt.logs) {
      try {
        const parsedLog = mailbox.interface.parseLog(log);
        if (parsedLog.name === 'Dispatch') {
          const messageBytes = parsedLog.args['message'];
          const msgId = messageId(messageBytes);
          logger.debug('Extracted message ID from tx', {
            txHash,
            messageId: msgId,
            chainName,
          });
          return msgId;
        }
      } catch {
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
 * Tries ProcessId logs in a recent block window first; on miss, uses
 * mailbox.processedAt() to locate the exact delivery block and fetch the log
 * there so the caller still gets a tx hash. Falls back to mailbox.delivered()
 * for pre-v3 mailboxes that don't expose processedAt.
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
  const destMetadata = multiProvider.tryGetChainMetadata(destinationChainName);
  if (destMetadata?.protocol !== 'ethereum') {
    logger.debug('Skipping delivery check for non-EVM chain', { destinationChainName });
    return { isDelivered: false };
  }

  const provider = multiProvider.getEthersV5Provider(destinationChainName);
  const mailbox = MailboxFactory.connect(mailboxAddr, provider);

  try {
    logger.debug(`Searching for process logs for msgId ${msgId}`);
    const currentBlock = await provider.getBlockNumber();
    const fromBlock = Math.max(0, currentBlock - (blockRange || DELIVERY_LOG_CHECK_BLOCK_RANGE));
    const logs = await mailbox.queryFilter(mailbox.filters.ProcessId(msgId), fromBlock, 'latest');
    if (logs?.length) {
      logger.debug(`Found process log for ${msgId}`);
      const log = logs[0];
      return {
        isDelivered: true,
        transactionHash: log.transactionHash,
        blockNumber: log.blockNumber,
      };
    }
  } catch (error) {
    logger.warn(`Error querying for process logs for msgId ${msgId}`, error);
  }

  try {
    logger.debug(`Querying mailbox.processedAt for msgId ${msgId}`);
    const processedBlock = await mailbox.processedAt(msgId);
    if (processedBlock > 0) {
      try {
        const logs = await mailbox.queryFilter(
          mailbox.filters.ProcessId(msgId),
          processedBlock,
          processedBlock,
        );
        if (logs?.length) {
          const log = logs[0];
          return {
            isDelivered: true,
            transactionHash: log.transactionHash,
            blockNumber: log.blockNumber,
          };
        }
        logger.warn(`processedAt returned ${processedBlock} but no ProcessId log at that block`);
      } catch (error) {
        logger.warn(`Error querying ProcessId log at block ${processedBlock}`, error);
      }
      return { isDelivered: true, blockNumber: processedBlock };
    }
    return { isDelivered: false };
  } catch (error) {
    // Pre-v3 mailboxes don't expose processedAt; fall back to the boolean.
    logger.warn(`Error calling processedAt for msgId ${msgId}, falling back to delivered()`, error);
    try {
      const isDelivered = await mailbox.delivered(msgId);
      return { isDelivered };
    } catch (error2) {
      logger.warn(`Error checking delivered status for msgId ${msgId}`, error2);
      return { isDelivered: false };
    }
  }
}
