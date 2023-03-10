import { constants } from 'ethers';

import { MultiProvider, chainIdToMetadata, hyperlaneCoreAddresses } from '@hyperlane-xyz/sdk';

import { Message, MessageStatus } from '../../types';
import { ensureLeading0x, validateAddress } from '../../utils/addresses';
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

import {
  MessageDeliveryFailingResult,
  MessageDeliveryStatusResponse,
  MessageDeliverySuccessResult,
} from './types';

// The keccak-256 hash of the ProcessId event: ProcessId(bytes32)
// https://github.com/hyperlane-xyz/hyperlane-monorepo/blob/1.0.0-beta0/solidity/contracts/Mailbox.sol#L84
// https://emn178.github.io/online-tools/keccak_256.html
// Alternatively could get this by creating the Mailbox contract object via SDK
const TOPIC_0 = '0x1cae38cdd3d3919489272725a5ae62a4f48b2989b0dae843d3c279fee18073a9';

export async function fetchDeliveryStatus(
  message: Message,
): Promise<MessageDeliveryStatusResponse> {
  validateMessage(message);

  const multiProvider = new MultiProvider();
  const logs = await fetchExplorerLogsForMessage(multiProvider, message);

  if (logs?.length) {
    logger.debug(`Found delivery log for tx ${message.originTransaction.transactionHash}`);
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
        from: txDetails?.from || constants.AddressZero,
        transactionHash: log.transactionHash,
        blockNumber: hexToDecimal(log.blockNumber),
        gasUsed: hexToDecimal(log.gasUsed),
        timestamp: hexToDecimal(log.timeStamp) * 1000,
      },
    };
    return result;
  } else {
    const { originChainId, originTransaction, nonce } = message;
    const originTxHash = originTransaction.transactionHash;
    const originName = chainIdToMetadata[originChainId].name;
    const environment = getChainEnvironment(originName);
    const originTxReceipt = await queryExplorerForTxReceipt(
      multiProvider,
      originChainId,
      originTxHash,
    );
    // TODO currently throwing this over the fence to the debugger script
    // which isn't very robust and uses public RPCs. Could be improved
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

async function fetchExplorerLogsForMessage(multiProvider: MultiProvider, message: Message) {
  const { msgId, originChainId, originTransaction, destinationChainId } = message;
  logger.debug(`Searching for delivery logs for tx ${originTransaction.transactionHash}`);

  const originName = chainIdToMetadata[originChainId].name;
  const destName = chainIdToMetadata[destinationChainId].name;

  const destMailboxAddr = hyperlaneCoreAddresses[destName]?.mailbox;
  if (!destMailboxAddr)
    throw new Error(`No mailbox address found for dest ${destName} origin ${originName}`);

  const topic1 = ensureLeading0x(msgId);
  const logsQueryPath = `module=logs&action=getLogs&fromBlock=0&toBlock=999999999&topic0=${TOPIC_0}&topic0_1_opr=and&topic1=${topic1}&address=${destMailboxAddr}`;
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
    // Since we only need this for the from address, it's not critical.
    // Swallowing error if there's an issue.
    logger.error('Failed to fetch tx details', txHash, chainId);
    return null;
  }
}

function validateMessage(message: Message) {
  const {
    originDomainId,
    destinationDomainId,
    originChainId,
    destinationChainId,
    nonce,
    originTransaction,
    recipient,
    sender,
  } = message;

  if (!originDomainId) throw new Error(`Invalid origin domain ${originDomainId}`);
  if (!destinationDomainId) throw new Error(`Invalid dest domain ${destinationDomainId}`);
  if (!originChainId) throw new Error(`Invalid origin chain ${originChainId}`);
  if (!destinationChainId) throw new Error(`Invalid dest chain ${destinationChainId}`);
  if (!chainIdToMetadata[originChainId]?.name)
    throw new Error(`No name found for chain ${originChainId}`);
  if (!chainIdToMetadata[destinationChainId]?.name)
    throw new Error(`No name found for chain ${destinationChainId}`);
  if (!nonce) throw new Error(`Invalid nonce ${nonce}`);
  if (!originTransaction?.transactionHash) throw new Error(`Invalid or missing origin tx`);
  validateAddress(recipient, 'validateMessage recipient');
  validateAddress(sender, 'validateMessage sender');
}
