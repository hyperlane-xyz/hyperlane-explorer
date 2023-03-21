import { constants } from 'ethers';

import { MultiProvider, hyperlaneCoreAddresses } from '@hyperlane-xyz/sdk';

import { getMultiProvider } from '../../multiProvider';
import { Message, MessageStatus } from '../../types';
import {
  queryExplorerForLogs,
  queryExplorerForTx,
  queryExplorerForTxReceipt,
} from '../../utils/explorers';
import { logger } from '../../utils/logger';
import { hexToDecimal } from '../../utils/number';
import { getChainEnvironment } from '../chains/utils';
import { debugMessagesForTransaction } from '../debugger/debugMessage';
import { MessageDebugStatus, TxDebugStatus } from '../debugger/types';
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
): Promise<MessageDeliveryStatusResponse> {
  const multiProvider = getMultiProvider();

  const originName = multiProvider.getChainName(message.originChainId);
  const destName = multiProvider.getChainName(message.destinationChainId);
  // TODO PI support here
  const destMailboxAddr = hyperlaneCoreAddresses[destName]?.mailbox;
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
        timestamp: hexToDecimal(log.timeStamp) * 1000,
        hash: log.transactionHash,
        from: txDetails?.from || constants.AddressZero,
        to: txDetails?.to || constants.AddressZero,
        blockHash: txDetails?.blockHash || TX_HASH_ZERO,
        blockNumber: hexToDecimal(log.blockNumber),
        mailbox: constants.AddressZero,
        nonce: txDetails?.nonce || 0,
        gasLimit: hexToDecimal(txDetails?.gasLimit || 0),
        gasPrice: hexToDecimal(txDetails?.gasPrice || 0),
        effectiveGasPrice: hexToDecimal(txDetails?.gasPrice || 0),
        gasUsed: hexToDecimal(log.gasUsed),
        cumulativeGasUsed: hexToDecimal(log.gasUsed),
        maxFeePerGas: hexToDecimal(txDetails?.maxFeePerGas || 0),
        maxPriorityPerGas: hexToDecimal(txDetails?.maxPriorityFeePerGas || 0),
      },
    };
    return result;
  } else {
    const { originChainId, origin, nonce } = message;
    const environment = getChainEnvironment(originName);
    const originTxReceipt = await queryExplorerForTxReceipt(
      multiProvider,
      originChainId,
      origin.hash,
    );
    const debugResult = await debugMessagesForTransaction(
      originName,
      originTxReceipt,
      environment,
      nonce,
      false,
    );

    // These two cases should never happen
    if (debugResult.status === TxDebugStatus.NotFound)
      throw new Error('Transaction not found by debugger');
    if (debugResult.status === TxDebugStatus.NoMessages)
      throw new Error('No messages found for transaction');

    const firstError = debugResult.messageDetails.find(
      (m) =>
        m.status !== MessageDebugStatus.NoErrorsFound &&
        m.status !== MessageDebugStatus.AlreadyProcessed,
    );
    if (!firstError) {
      return { status: MessageStatus.Pending };
    } else {
      const result: MessageDeliveryFailingResult = {
        status: MessageStatus.Failing,
        debugStatus: firstError.status,
        debugDetails: firstError.details,
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
