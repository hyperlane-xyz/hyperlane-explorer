import { constants } from 'ethers';

import { hyperlaneCoreAddresses } from '@hyperlane-xyz/sdk';
import { utils } from '@hyperlane-xyz/utils';

import { chainIdToName } from '../../consts/chains';
import { chainToDomain, domainToChain } from '../../consts/domains';
import { Message, MessageStatus } from '../../types';
import { validateAddress } from '../../utils/addresses';
import { getChainEnvironment } from '../../utils/chains';
import {
  queryExplorerForLogs,
  queryExplorerForTx,
  queryExplorerForTxReceipt,
} from '../../utils/explorers';
import { logger } from '../../utils/logger';
import { hexToDecimal } from '../../utils/number';
import { debugMessagesForTransaction } from '../debugger/debugMessage';
import { MessageDebugStatus, TxDebugStatus } from '../debugger/types';

import {
  MessageDeliveryFailingResult,
  MessageDeliveryStatusResponse,
  MessageDeliverySuccessResult,
} from './types';

// The keccak hash of the Process event
// https://github.com/hyperlane-xyz/hyperlane-monorepo/blob/main/solidity/core/contracts/Inbox.sol#L59
// Alternatively could get this by creating the Inbox contract object via SDK
const TOPIC_0 = '0x77465daf33ba3eb7f35b343a1acdaa7b7e6b3f8944dc7808dcb55dfa67eef4fb';

export async function fetchDeliveryStatus(
  message: Message,
): Promise<MessageDeliveryStatusResponse> {
  validateMessage(message);

  const logs = await fetchExplorerLogsForMessage(message);

  if (logs?.length) {
    logger.debug(`Found delivery log for tx ${message.originTransaction.transactionHash}`);
    const log = logs[0]; // Should only be 1 log per message delivery
    const txDetails = await tryFetchTransactionDetails(
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
    const originTxHash = message.originTransaction.transactionHash;
    const originChainId = message.originChainId;
    const originName = chainIdToName[originChainId];
    const environment = getChainEnvironment(originName);
    const originTxReceipt = await queryExplorerForTxReceipt(originChainId, originTxHash);
    // TODO currently throwing this over the fence to the debugger script
    // which isn't very robust and uses public RPCs. Could be improved
    const debugResult = await debugMessagesForTransaction(
      originName,
      originTxReceipt,
      environment,
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
      };
      return result;
    }
  }
}

async function fetchExplorerLogsForMessage(message: Message) {
  const {
    originDomainId,
    destinationDomainId: destDomainId,
    originChainId,
    originTransaction,
    destinationChainId,
    leafIndex,
    recipient,
    sender,
    body,
  } = message;
  logger.debug(`Searching for delivery logs for tx ${originTransaction.transactionHash}`);

  const originName = chainIdToName[originChainId];
  const destName = chainIdToName[destinationChainId];

  const destInboxAddr = hyperlaneCoreAddresses[destName]?.inboxes[originName];
  if (!destInboxAddr)
    throw new Error(`No inbox address found for dest ${destName} origin ${originName}`);

  const msgRawBytes = utils.formatMessage(originDomainId, sender, destDomainId, recipient, body);
  const messageHash = utils.messageHash(msgRawBytes, leafIndex);

  const logsQueryPath = `api?module=logs&action=getLogs&fromBlock=0&toBlock=999999999&topic0=${TOPIC_0}&topic0_1_opr=and&topic1=${messageHash}&address=${destInboxAddr}`;
  return queryExplorerForLogs(destinationChainId, logsQueryPath, TOPIC_0);
}

async function tryFetchTransactionDetails(chainId: number, txHash: string) {
  try {
    const tx = await queryExplorerForTx(chainId, txHash);
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
    leafIndex,
    originTransaction,
    recipient,
    sender,
  } = message;

  if (!originDomainId || !domainToChain[originDomainId])
    throw new Error(`Invalid origin domain ${originDomainId}`);
  if (!destinationDomainId || !domainToChain[destinationDomainId])
    throw new Error(`Invalid dest domain ${destinationDomainId}`);
  if (!originChainId || !chainToDomain[originChainId])
    throw new Error(`Invalid origin chain ${originChainId}`);
  if (!destinationChainId || !chainToDomain[destinationChainId])
    throw new Error(`Invalid dest chain ${destinationChainId}`);
  if (!chainIdToName[originChainId]) throw new Error(`No name found for chain ${originChainId}`);
  if (!chainIdToName[destinationChainId])
    throw new Error(`No name found for chain ${destinationChainId}`);
  if (!leafIndex) throw new Error(`Invalid leaf index ${leafIndex}`);
  if (!originTransaction?.transactionHash) throw new Error(`Invalid or missing origin tx`);
  validateAddress(recipient, 'validateMessage recipient');
  validateAddress(sender, 'validateMessage sender');
}
