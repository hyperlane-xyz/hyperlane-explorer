import { MOCK_TRANSACTION } from '../../test/mockMessages';
import { Message, MessageStatus } from '../../types';

import { MessageDbEntry, MessagesQueryResult } from './types';

export function parseResultData(
  data: MessagesQueryResult | undefined,
): Message[] {
  if (!data?.messages?.length) return [];
  return data.messages.map(parseMessage);
}

function parseMessage(m: MessageDbEntry) {
  return {
    id: m.id,
    status: m.status as MessageStatus,
    sender: m.sender,
    recipient: m.recipient,
    body: m.body,
    originChainId: m.originchainid,
    originTimeSent: m.origintimesent,
    destinationChainId: m.destinationchainid,
    destinationTimeSent: m.destinationtimesent,
    // TODO
    originTransaction: MOCK_TRANSACTION,
    destinationTransaction: MOCK_TRANSACTION,
  };
}
