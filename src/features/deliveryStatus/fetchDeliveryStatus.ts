import { constants } from 'ethers';

import { MultiProvider, hyperlaneEnvironments } from '@hyperlane-xyz/sdk';

import { Message, MessageStatus } from '../../types';
import { logger } from '../../utils/logger';
import { toDecimalNumber } from '../../utils/number';
import { getChainEnvironment } from '../chains/utils';
import { debugExplorerMessage } from '../debugger/debugMessage';
import { MessageDebugStatus } from '../debugger/types';
import { TX_HASH_ZERO } from '../messages/placeholderMessages';

import {
  MessageDeliveryFailingResult,
  MessageDeliveryStatusResponse,
  MessageDeliverySuccessResult,
} from './types';

// The keccak-256 hash of the ProcessId event: ProcessId(bytes32)
// https://github.com/hyperlane-xyz/hyperlane-monorepo/blob/1.0.0-beta0/solidity/contracts/Mailbox.sol#L84
// https://emn178.github.io/online-tools/keccak_256.html
// Alternatively could get this by creating the Mailbox contract object via SDK
const PROCESS_TOPIC_0 = '0x1cae38cdd3d3919489272725a5ae62a4f48b2989b0dae843d3c279fee18073a9';

export async function fetchDeliveryStatus(
  multiProvider: MultiProvider,
  message: Message,
): Promise<MessageDeliveryStatusResponse> {
  const destName = multiProvider.getChainName(message.destinationChainId);
  const destEnv = getChainEnvironment(multiProvider, destName);
  // TODO PI support here
  const destMailboxAddr = hyperlaneEnvironments[destEnv][destName]?.mailbox;
  if (!destMailboxAddr) throw new Error(`No mailbox address found for dest ${destName}`);

  const logs = await fetchMessageLogs(multiProvider, message, destMailboxAddr);

  if (logs?.length) {
    logger.debug(`Found delivery log for tx ${message.origin.hash}`);
    const log = logs[0]; // Should only be 1 log per message delivery
    const txDetails = await fetchTransactionDetails(
      multiProvider,
      message.destinationChainId,
      log.transactionHash,
    );
    // If a delivery (aka process) tx is found, assume success
    const result: MessageDeliverySuccessResult = {
      status: MessageStatus.Delivered,
      deliveryTransaction: {
        timestamp: toDecimalNumber(txDetails.timestamp || 0) * 1000,
        hash: log.transactionHash,
        from: txDetails.from || constants.AddressZero,
        to: txDetails.to || constants.AddressZero,
        blockHash: txDetails.blockHash || TX_HASH_ZERO,
        blockNumber: toDecimalNumber(log.blockNumber),
        mailbox: constants.AddressZero,
        nonce: txDetails.nonce || 0,
        gasLimit: toDecimalNumber(txDetails.gasLimit || 0),
        gasPrice: toDecimalNumber(txDetails.gasPrice || 0),
        effectiveGasPrice: toDecimalNumber(txDetails.gasPrice || 0),
        gasUsed: toDecimalNumber(txDetails.gasLimit || 0),
        cumulativeGasUsed: toDecimalNumber(txDetails.gasLimit || 0),
        maxFeePerGas: toDecimalNumber(txDetails.maxFeePerGas || 0),
        maxPriorityPerGas: toDecimalNumber(txDetails.maxPriorityFeePerGas || 0),
      },
    };
    return result;
  } else {
    const debugResult = await debugExplorerMessage(message, multiProvider);
    if (
      debugResult.status === MessageDebugStatus.NoErrorsFound ||
      debugResult.status === MessageDebugStatus.AlreadyProcessed
    ) {
      return { status: MessageStatus.Pending };
    } else {
      const result: MessageDeliveryFailingResult = {
        status: MessageStatus.Failing,
        debugStatus: debugResult.status,
        debugDetails: debugResult.details,
      };
      return result;
    }
  }
}

function fetchMessageLogs(multiProvider: MultiProvider, message: Message, mailboxAddr: Address) {
  const { msgId, origin, destinationChainId } = message;
  logger.debug(`Searching for delivery logs for tx ${origin.hash}`);
  const provider = multiProvider.getProvider(destinationChainId);
  return provider.getLogs({
    topics: [PROCESS_TOPIC_0, msgId],
    address: mailboxAddr,
  });
}

async function fetchTransactionDetails(
  multiProvider: MultiProvider,
  chainId: ChainId,
  txHash: string,
) {
  logger.debug(`Searching for transaction details for ${txHash}`);
  const provider = multiProvider.getProvider(chainId);
  return provider.getTransaction(txHash);
}
