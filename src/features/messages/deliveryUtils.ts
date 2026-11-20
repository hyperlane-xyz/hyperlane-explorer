import { Mailbox__factory as MailboxFactory } from '@hyperlane-xyz/core';

import { DELIVERY_LOG_CHECK_BLOCK_RANGE } from '../../consts/values';
import { logger } from '../../utils/logger';
import type { ExplorerMultiProvider as MultiProtocolProvider } from '../hyperlane/sdkRuntime';

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
    // processedAt may revert on pre-v3 mailboxes that don't expose it, or on
    // transient RPC issues. Either way, fall back to the boolean so we don't
    // block the UI; tx-hash recovery is lost in this branch.
    logger.warn(
      `processedAt call failed for msgId ${msgId} (pre-v3 mailbox or RPC issue); falling back to delivered()`,
      error,
    );
    try {
      const isDelivered = await mailbox.delivered(msgId);
      return { isDelivered };
    } catch (error2) {
      logger.warn(`Error checking delivered status for msgId ${msgId}`, error2);
      return { isDelivered: false };
    }
  }
}
