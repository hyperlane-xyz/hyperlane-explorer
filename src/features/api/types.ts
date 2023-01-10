import { Message } from '../../types';

export type ApiMessage = Omit<
  Message,
  | 'msgId' // use id field for msgId
  | 'originChainId'
  | 'destinationChainId'
  | 'originTimestamp'
  | 'destinationTimestamp'
  | 'decodedBody'
>;

export function toApiMessage(message: Message): ApiMessage {
  // prettier-ignore
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const {msgId, originChainId, destinationChainId, originTimestamp, destinationTimestamp, decodedBody, ...rest} = message
  return {
    ...rest,
    id: msgId,
  };
}
