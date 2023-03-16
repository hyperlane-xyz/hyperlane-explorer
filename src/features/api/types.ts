import { Message } from '../../types';

export type ApiHandlerResult<T> =
  | {
      success: true;
      data: T;
    }
  | {
      success: false;
      error: string;
    };

export type ApiMessage = Omit<
  Message,
  | 'msgId' // use id field for msgId
  | 'decodedBody'
>;

export function toApiMessage(message: Message): ApiMessage {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { msgId, decodedBody, ...rest } = message;
  return {
    ...rest,
    id: msgId,
  };
}
