import { constants } from 'ethers';

import { MultiProvider, hyperlaneEnvironments } from '@hyperlane-xyz/sdk';

import { getMultiProvider } from '../../multiProvider';
import { Message, MessageStatus } from '../../types';
import { queryExplorerForLogs, queryExplorerForTx } from '../../utils/explorers';
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
  message: Message,
  multiProvider = getMultiProvider(),
): Promise<MessageDeliveryStatusResponse> {
  const destName = multiProvider.getChainName(message.destinationChainId);
  const destEnv = getChainEnvironment(destName);
  // TODO PI support here
  const destMailboxAddr = hyperlaneEnvironments[destEnv][destName]?.mailbox;
  if (!destMailboxAddr) throw new Error(`No mailbox address found for dest ${destName}`);

  const logs = await fetchExplorerLogsForMessage(multiProvider, message, destMailboxAddr);

  if (logs?.length) {
    logger.debug(`Found delivery log for tx ${message.origin.hash}`);
    const log = logs[0]; // Should only be 1 log per message delivery
    const txDetails = await tryFetchTransactionDetails(
      multiProvider,
      message.destinationChainId,
      log.transactionHash,
    );
    // If a delivery (aka process) tx is found, assume success
    const result: MessageDeliverySuccessResult = {
      status: MessageStatus.Delivered,
      deliveryTransaction: {
        timestamp: toDecimalNumber(log.timeStamp) * 1000,
        hash: log.transactionHash,
        from: txDetails?.from || constants.AddressZero,
        to: txDetails?.to || constants.AddressZero,
        blockHash: txDetails?.blockHash || TX_HASH_ZERO,
        blockNumber: toDecimalNumber(log.blockNumber),
        mailbox: constants.AddressZero,
        nonce: txDetails?.nonce || 0,
        gasLimit: toDecimalNumber(txDetails?.gasLimit || 0),
        gasPrice: toDecimalNumber(txDetails?.gasPrice || 0),
        effectiveGasPrice: toDecimalNumber(txDetails?.gasPrice || 0),
        gasUsed: toDecimalNumber(log.gasUsed),
        cumulativeGasUsed: toDecimalNumber(log.gasUsed),
        maxFeePerGas: toDecimalNumber(txDetails?.maxFeePerGas || 0),
        maxPriorityPerGas: toDecimalNumber(txDetails?.maxPriorityFeePerGas || 0),
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

function fetchExplorerLogsForMessage(
  multiProvider: MultiProvider,
  message: Message,
  mailboxAddr: Address,
) {
  const { msgId, origin, destinationChainId } = message;
  logger.debug(`Searching for delivery logs for tx ${origin.hash}`);
  const logsQueryPath = `module=logs&action=getLogs&fromBlock=1&toBlock=latest&topic0=${PROCESS_TOPIC_0}&topic0_1_opr=and&topic1=${msgId}&address=${mailboxAddr}`;
  return queryExplorerForLogs(multiProvider, destinationChainId, logsQueryPath);
}

async function tryFetchTransactionDetails(
  multiProvider: MultiProvider,
  chainId: number,
  txHash: string,
) {
  try {
    const tx = await queryExplorerForTx(multiProvider, chainId, txHash);
    return tx;
  } catch (error) {
    // Swallowing error if there's an issue so we can still surface delivery confirmation
    logger.error('Failed to fetch tx details', txHash, chainId);
    return null;
  }
}
