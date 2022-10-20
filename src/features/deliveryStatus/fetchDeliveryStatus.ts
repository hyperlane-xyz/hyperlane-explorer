import { constants } from 'ethers';

import { hyperlaneCoreAddresses } from '@hyperlane-xyz/sdk';
import { utils } from '@hyperlane-xyz/utils';

import { chainIdToName } from '../../consts/chains';
import { config as appConfig } from '../../consts/config';
import { chainToDomain } from '../../consts/domains';
import { Message } from '../../types';
import { getExplorerUrl, queryExplorerForLogs } from '../../utils/explorers';
import { hexToDecimal } from '../../utils/number';
import { MessageDebugStatus } from '../debugger/debugMessage';

import {
  MessageDeliveryFailingResult,
  MessageDeliveryStatus,
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
  const logs = await fetchExplorerLogsForMessage(message);

  if (logs?.length) {
    const log = logs[0]; // Should only be 1 log per message delivery
    console.log(log);

    // If a delivery (aka process) tx is found, assume success
    const result: MessageDeliverySuccessResult = {
      status: MessageDeliveryStatus.Success,
      deliveryTransaction: {
        from: constants.AddressZero, // TODO use process tx sender instead here
        transactionHash: log.transactionHash,
        blockNumber: hexToDecimal(log.blockNumber),
        gasUsed: hexToDecimal(log.gasUsed),
        timestamp: hexToDecimal(log.timeStamp) * 1000,
      },
    };
    return result;
  } else {
    // TODO process tx not found, debug message
    console.log('no log found', message);
    const result: MessageDeliveryFailingResult = {
      status: MessageDeliveryStatus.Failing,
      debugStatus: MessageDebugStatus.NoErrorsFound,
    };
    return result;
  }
}

async function fetchExplorerLogsForMessage(message: Message) {
  const { originChainId, destinationChainId, leafIndex, recipient, sender, body } = message;
  if (!originChainId || !destinationChainId || !leafIndex || !recipient || !sender || !body)
    throw new Error('Invalid message properties');

  const originDomain = chainToDomain[originChainId];
  const destDomain = chainToDomain[destinationChainId];
  if (!originDomain || !destDomain)
    throw new Error(`No domain found for chain ${originChainId} or ${destinationChainId}`);

  const originName = chainIdToName[originChainId];
  const destName = chainIdToName[destinationChainId];
  if (!originName || !destName)
    throw new Error(`No name found for chain ${originChainId} or ${destinationChainId}`);

  const destInboxAddr = hyperlaneCoreAddresses[destName]?.inboxes[originName];
  if (!destInboxAddr)
    throw new Error(`No inbox address found for dest ${destName} origin ${originName}`);

  const packedMessage = utils.formatMessage(originDomain, sender, destDomain, recipient, body);
  const messageHash = utils.messageHash(packedMessage, leafIndex);

  const explorerBaseUrl = getExplorerUrl(destinationChainId);
  if (!explorerBaseUrl)
    throw new Error(`No URL found for explorer for chain ${destinationChainId}`);

  const explorerApiKey = appConfig.explorerApiKeys[destinationChainId];
  if (!explorerApiKey) throw new Error(`No API key for explorer for chain ${destinationChainId}`);

  const logsQueryUrl = `${explorerBaseUrl}/api?module=logs&action=getLogs&fromBlock=0&toBlock=999999999&topic0=${TOPIC_0}&topic0_1_opr=and&topic1=${messageHash}&address=${destInboxAddr}&apikey=${explorerApiKey}`;

  return queryExplorerForLogs(logsQueryUrl);
}
