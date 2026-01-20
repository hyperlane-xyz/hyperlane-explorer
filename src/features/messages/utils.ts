import { MultiProtocolProvider } from '@hyperlane-xyz/sdk';
import {
  bytesToProtocolAddress,
  fromBase64,
  fromHexString,
  fromWei,
  parseWarpRouteMessage,
  toBase64,
} from '@hyperlane-xyz/utils';
// eslint-disable-next-line camelcase
import { Mailbox__factory } from '@hyperlane-xyz/core';
import { messageId } from '@hyperlane-xyz/utils';
import { DELIVERY_LOG_CHECK_BLOCK_RANGE } from '../../consts/values';
import { Message, MessageStub, WarpRouteChainAddressMap, WarpRouteDetails } from '../../types';
import { formatAddress } from '../../utils/addresses';
import { logger } from '../../utils/logger';
import { getTokenFromWarpRouteChainAddressMap } from '../../utils/token';
import { getWarpRouteAmountParts } from '../../utils/warpRouteAmounts';

// Cosmos warp standards don't normalize amounts to maxDecimals
const COSMOS_STANDARDS = new Set([
  'CW20',
  'CWNative',
  'CW721',
  'CwHypNative',
  'CwHypCollateral',
  'CwHypSynthetic',
  'CosmosIbc',
]);

export function serializeMessage(msg: MessageStub | Message): string | undefined {
  return toBase64(msg);
}

export function deserializeMessage<M extends MessageStub>(data: string | string[]): M | undefined {
  return fromBase64<M>(data);
}

export function parseWarpRouteMessageDetails(
  message: Message | MessageStub,
  warpRouteChainAddressMap: WarpRouteChainAddressMap,
  multiProvider: MultiProtocolProvider,
): WarpRouteDetails | undefined {
  try {
    const { body, sender, originDomainId, destinationDomainId, recipient } = message;

    const originMetadata = multiProvider.tryGetChainMetadata(originDomainId);
    const destinationMetadata = multiProvider.tryGetChainMetadata(destinationDomainId);

    if (!body || !originMetadata || !destinationMetadata) return undefined;

    const parsedSender = formatAddress(sender, originDomainId, multiProvider);
    const parsedRecipient = formatAddress(recipient, destinationDomainId, multiProvider);

    const originToken = getTokenFromWarpRouteChainAddressMap(
      originMetadata,
      parsedSender,
      warpRouteChainAddressMap,
    );
    const destinationToken = getTokenFromWarpRouteChainAddressMap(
      destinationMetadata,
      parsedRecipient,
      warpRouteChainAddressMap,
    );

    // If tokens are not found with the addresses, it means the message
    // is not a warp transfer between tokens known to the registry
    if (!originToken || !destinationToken) return undefined;

    const parsedMessage = parseWarpRouteMessage(body);
    const bytes = fromHexString(parsedMessage.recipient);
    const address = bytesToProtocolAddress(
      bytes,
      destinationMetadata.protocol,
      destinationMetadata.bech32Prefix,
    );

    // Determine effective decimals based on token standard:
    // - If scale is explicitly set, use origin token decimals
    // - Cosmos standards don't normalize, so use min decimals
    // - Other standards (EVM, Sealevel) normalize to maxDecimals
    const isCosmosRoute =
      COSMOS_STANDARDS.has(originToken.standard) || COSMOS_STANDARDS.has(destinationToken.standard);
    const effectiveDecimals =
      originToken.scale !== undefined
        ? originToken.decimals
        : isCosmosRoute
          ? Math.min(originToken.decimals ?? 18, destinationToken.decimals ?? 18)
          : originToken.maxDecimals;

    const amountParts = getWarpRouteAmountParts(parsedMessage.amount, {
      decimals: effectiveDecimals,
      scale: originToken.scale,
    });

    return {
      amount: fromWei(amountParts.amount.toString(), amountParts.decimals),
      transferRecipient: address,
      originToken: originToken,
      destinationToken: destinationToken,
    };
  } catch (err) {
    logger.error(`Error parsing warp route details for ${message.id}:`, err);
    return undefined;
  }
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
