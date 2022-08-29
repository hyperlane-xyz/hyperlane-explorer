import { DomainToChain } from '../../consts/domains';
import { Message, MessageStatus, PartialTransactionReceipt } from '../../types';
import { logger } from '../../utils/logger';

import { MessageEntry, MessagesQueryResult, TransactionEntry } from './types';

export function parseResultData(
  data: MessagesQueryResult | undefined,
): Message[] {
  if (!data?.message?.length) return [];
  return data.message.map(parseMessage).filter((m): m is Message => !!m);
}

function parseMessage(m: MessageEntry): Message | null {
  try {
    const { delivered_message, message_states } = m;
    let status = MessageStatus.Pending;
    let destinationTransaction: PartialTransactionReceipt | undefined =
      undefined;
    if (delivered_message) {
      status = MessageStatus.Delivered;
      destinationTransaction = parseTransaction(delivered_message.transaction);
    } else if (message_states.length > 0) {
      const latestState = message_states.at(-1);
      if (latestState && latestState.processable) {
        status = MessageStatus.Failing;
      }
    }

    return {
      id: m.id,
      status,
      sender: decodeBinaryHex(m.sender),
      recipient: decodeBinaryHex(m.recipient),
      body: m.msg_body ?? '',
      originChainId: DomainToChain[m.origin],
      destinationChainId: DomainToChain[m.destination],
      timestamp: parseTimestampString(m.timestamp),
      originTransaction: parseTransaction(m.transaction),
      destinationTransaction,
    };
  } catch (error) {
    logger.error('Error parsing message', error);
    return null;
  }
}

function parseTransaction(t: TransactionEntry): PartialTransactionReceipt {
  return {
    from: decodeBinaryHex(t.sender),
    transactionHash: decodeBinaryHex(t.hash),
    blockNumber: t.block.height,
    gasUsed: t.gas_used,
    timestamp: parseTimestampString(t.block.timestamp),
  };
}

function parseTimestampString(t: string) {
  return new Date(t).getTime();
}

// TODO use text in db instead of bytea
function decodeBinaryHex(b: string) {
  return btoa(b);
  // const byteArray = b.substring(3).map(c => parseInt(c))
  // return Array.from(byteArray, (byte)=>
  //   ('0' + (byte & 0xFF).toString(16)).slice(-2)
  // ).join('')
}
