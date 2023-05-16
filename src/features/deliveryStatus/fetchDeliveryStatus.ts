import { constants } from 'ethers';

import { IMailbox__factory } from '@hyperlane-xyz/core';
import { ChainMap, MultiProvider } from '@hyperlane-xyz/sdk';

import { Message, MessageStatus } from '../../types';
import { logger } from '../../utils/logger';
import { toDecimalNumber } from '../../utils/number';
import type { ChainConfig } from '../chains/chainConfig';
import { getContractAddress } from '../chains/utils';
import { debugMessage } from '../debugger/debugMessage';
import { MessageDebugStatus } from '../debugger/types';

import {
  MessageDeliveryFailingResult,
  MessageDeliveryPendingResult,
  MessageDeliveryStatusResponse,
  MessageDeliverySuccessResult,
} from './types';

export async function fetchDeliveryStatus(
  multiProvider: MultiProvider,
  customChainConfigs: ChainMap<ChainConfig>,
  message: Message,
): Promise<MessageDeliveryStatusResponse> {
  const destName = multiProvider.getChainName(message.destinationChainId);
  const destMailboxAddr = getContractAddress(customChainConfigs, destName, 'mailbox');

  const { isDelivered, blockNumber, transactionHash } = await checkIsMessageDelivered(
    multiProvider,
    message,
    destMailboxAddr,
  );

  if (isDelivered) {
    const txDetails = await fetchTransactionDetails(
      multiProvider,
      message.destinationChainId,
      transactionHash,
    );
    // If a delivery (aka process) tx is found, mark as success
    const result: MessageDeliverySuccessResult = {
      status: MessageStatus.Delivered,
      deliveryTransaction: {
        timestamp: toDecimalNumber(txDetails?.timestamp || 0) * 1000,
        hash: transactionHash || constants.HashZero,
        from: txDetails?.from || constants.AddressZero,
        to: txDetails?.to || constants.AddressZero,
        blockHash: txDetails?.blockHash || constants.HashZero,
        blockNumber: toDecimalNumber(blockNumber || 0),
        mailbox: constants.AddressZero,
        nonce: txDetails?.nonce || 0,
        gasLimit: toDecimalNumber(txDetails?.gasLimit || 0),
        gasPrice: toDecimalNumber(txDetails?.gasPrice || 0),
        effectiveGasPrice: toDecimalNumber(txDetails?.gasPrice || 0),
        gasUsed: toDecimalNumber(txDetails?.gasLimit || 0),
        cumulativeGasUsed: toDecimalNumber(txDetails?.gasLimit || 0),
        maxFeePerGas: toDecimalNumber(txDetails?.maxFeePerGas || 0),
        maxPriorityPerGas: toDecimalNumber(txDetails?.maxPriorityFeePerGas || 0),
      },
    };
    return result;
  } else {
    const {
      status: debugStatus,
      details: debugDetails,
      gasDetails,
    } = await debugMessage(multiProvider, customChainConfigs, message);
    const messageStatus =
      debugStatus === MessageDebugStatus.NoErrorsFound
        ? MessageStatus.Pending
        : MessageStatus.Failing;
    const result: MessageDeliveryPendingResult | MessageDeliveryFailingResult = {
      status: messageStatus,
      debugStatus,
      debugDetails,
      gasDetails,
    };
    return result;
  }
}

async function checkIsMessageDelivered(
  multiProvider: MultiProvider,
  message: Message,
  mailboxAddr: Address,
) {
  const { msgId, destinationChainId } = message;
  const provider = multiProvider.getProvider(destinationChainId);
  const mailbox = IMailbox__factory.connect(mailboxAddr, provider);

  // Try finding logs first as they have more info
  try {
    logger.debug(`Searching for process logs for msgId ${msgId}`);
    const logs = await mailbox.queryFilter(mailbox.filters.ProcessId(msgId));
    if (logs?.length) {
      logger.debug(`Found process log for ${msgId}}`);
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
  logger.debug(`Mailbox delivery status for ${msgId}: ${isDelivered}}`);
  return { isDelivered };
}

function fetchTransactionDetails(multiProvider: MultiProvider, chainId: ChainId, txHash?: string) {
  if (!txHash) return null;
  logger.debug(`Searching for transaction details for ${txHash}`);
  const provider = multiProvider.getProvider(chainId);
  return provider.getTransaction(txHash);
}
