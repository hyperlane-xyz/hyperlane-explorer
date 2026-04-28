import type { IRegistry } from '@hyperlane-xyz/registry';
import type { ChainMetadata } from '@hyperlane-xyz/sdk/metadata/chainMetadataTypes';
import type { ChainMap } from '@hyperlane-xyz/sdk/types';
import { constants } from 'ethers';

import { Message, MessageStatus, MessageStub } from '../../types';
import { logger } from '../../utils/logger';
import { toDecimalNumber } from '../../utils/number';
import { getMailboxAddress } from '../chains/utils';
import { debugMessage } from '../debugger/debugMessage';
import { MessageDebugStatus } from '../debugger/types';
import type { ExplorerMultiProvider as MultiProtocolProvider } from '../hyperlane/sdkRuntime';
import { checkIsMessageDelivered } from '../messages/deliveryUtils';
import {
  MessageDeliveryFailingResult,
  MessageDeliveryPendingResult,
  MessageDeliveryStatusResponse,
  MessageDeliverySuccessResult,
} from './types';

export async function fetchDeliveryStatus(
  multiProvider: MultiProtocolProvider,
  registry: IRegistry,
  overrideChainMetadata: ChainMap<Partial<ChainMetadata>>,
  message: Message | MessageStub,
): Promise<MessageDeliveryStatusResponse> {
  const destName = multiProvider.tryGetChainName(message.destinationDomainId);
  if (!destName)
    throw new Error(
      `Cannot check delivery status, no chain name provided for domain ${message.destinationDomainId}`,
    );
  const destMailboxAddr = await getMailboxAddress(destName, overrideChainMetadata, registry);
  if (!destMailboxAddr)
    throw new Error(
      `Cannot check delivery status, no mailbox address provided for chain ${destName}`,
    );

  const { isDelivered, blockNumber, transactionHash } = await checkIsMessageDelivered(
    message.msgId,
    message.destinationDomainId,
    destMailboxAddr,
    multiProvider,
  );

  if (isDelivered) {
    const { tx: txDetails, blockTimestamp } = await fetchTransactionDetails(
      multiProvider,
      message.destinationDomainId,
      transactionHash,
      blockNumber,
    );
    // If a delivery (aka process) tx is found, mark as success
    const result: MessageDeliverySuccessResult = {
      status: MessageStatus.Delivered,
      deliveryTransaction: {
        timestamp: toDecimalNumber(blockTimestamp ?? 0) * 1000,
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
    const debugResult = await debugMessage(multiProvider, registry, overrideChainMetadata, message);
    const messageStatus =
      debugResult.status === MessageDebugStatus.NoErrorsFound
        ? MessageStatus.Pending
        : MessageStatus.Failing;
    const result: MessageDeliveryPendingResult | MessageDeliveryFailingResult = {
      status: messageStatus,
      debugResult,
    };
    return result;
  }
}

async function fetchTransactionDetails(
  multiProvider: MultiProtocolProvider,
  domainId: DomainId,
  txHash?: string,
  blockNumber?: number,
) {
  if (!txHash && !blockNumber) return { tx: null, blockTimestamp: null };
  logger.debug(`Searching for transaction details for ${txHash ?? `block ${blockNumber}`}`);
  const provider = multiProvider.getEthersV5Provider(domainId);
  const [tx, block] = await Promise.all([
    txHash ? provider.getTransaction(txHash) : Promise.resolve(null),
    blockNumber
      ? provider.getBlock(blockNumber).catch((error) => {
          logger.warn('Failed to fetch block for delivery timestamp', {
            domainId,
            txHash,
            blockNumber,
            error,
          });
          return null;
        })
      : Promise.resolve(null),
  ]);
  return { tx, blockTimestamp: block?.timestamp ?? null };
}
