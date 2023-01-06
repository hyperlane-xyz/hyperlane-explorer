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
