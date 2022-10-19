import { useQuery } from '@tanstack/react-query';

import { utils } from '@hyperlane-xyz/utils';

import { chainToDomain } from '../../consts/domains';
import { Message } from '../../types';
import { getExplorerUrl, queryExplorerForLogs } from '../../utils/explorers';

// The keccak hash of the Process event
// https://github.com/hyperlane-xyz/hyperlane-monorepo/blob/main/solidity/core/contracts/Inbox.sol#L59
// Alternatively could get this by creating the Inbox contract object via SDK
const TOPIC_0 = '0x77465daf33ba3eb7f35b343a1acdaa7b7e6b3f8944dc7808dcb55dfa67eef4fb';

// Example query url
// https://mumbai.polygonscan.com/api?module=logs&action=getLogs&fromBlock=0&toBlock=999999999999&topic0=0x77465daf33ba3eb7f35b343a1acdaa7b7e6b3f8944dc7808dcb55dfa67eef4fb&topic0_1_opr=and&topic1=0x73da898a44a12440db37253ab2dbbaba1490d4a5e592ce392fdb94dd6702123f&address=0x56c09458cC7863fff1Cc6Bcb6652Dcc3412FcA86&apikey=KEY_HERE

export function useMessageProcessTx(message: Message, isReady: boolean) {
  return useQuery(
    ['messageProcessTx', message, isReady],
    async () => {
      if (!message || !isReady) return null;

      const originDomain = chainToDomain[message.originChainId];
      const destDomain = chainToDomain[message.destinationChainId];
      const packedMessage = utils.formatMessage(
        originDomain,
        message.sender,
        destDomain,
        message.recipient,
        message.body,
      );
      const messageHash = utils.messageHash(packedMessage, message.leafIndex);
      const destInboxAddr = ''; // TODO
      const explorerApiKey = ''; // TODO

      const explorerBaseUrl = getExplorerUrl(message.destinationChainId);
      if (!explorerBaseUrl) return null;

      const logsQueryUrl = `${explorerBaseUrl}/api?module=logs&action=getLogs&fromBlock=0&toBlock=999999999&topic0=${TOPIC_0}&topic0_1_opr=and&topic1=${messageHash}&address=${destInboxAddr}&apikey=${explorerApiKey}`;

      const logs = await queryExplorerForLogs(logsQueryUrl);
      if (logs?.length) {
        const log = logs[0]; // Should only be 1 log per message delivery
        // TODO get needed tx properties and return them
      } else {
        // TODO process tx not found, debug message
      }
    },
    { retry: false },
  );
}
