import { IRegistry } from '@hyperlane-xyz/registry';
import { ChainMap, ChainMetadata, MultiProtocolProvider } from '@hyperlane-xyz/sdk';
import { constants } from 'ethers';
import { Message, MessageStatus } from '../../types';
import { logger } from '../../utils/logger';
import { toDecimalNumber } from '../../utils/number';
import { getMailboxAddress } from '../chains/utils';
import { debugMessage } from '../debugger/debugMessage';
import { MessageDebugStatus } from '../debugger/types';
import { checkIsMessageDelivered } from '../messages/utils';
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
  message: Message,
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
    // Fetch both transaction details and debug info (for ISM/validator details)
    const [txDetails, debugResult] = await Promise.all([
      fetchTransactionDetails(multiProvider, message.destinationDomainId, transactionHash),
      debugMessage(multiProvider, registry, overrideChainMetadata, message).catch((err) => {
        logger.warn('Failed to fetch debug info for delivered message:', err);
        return undefined;
      }),
    ]);
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
      debugResult,
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

function fetchTransactionDetails(
  multiProvider: MultiProtocolProvider,
  domainId: DomainId,
  txHash?: string,
) {
  if (!txHash) return null;
  logger.debug(`Searching for transaction details for ${txHash}`);
  const provider = multiProvider.getEthersV5Provider(domainId);
  return provider.getTransaction(txHash);
}
