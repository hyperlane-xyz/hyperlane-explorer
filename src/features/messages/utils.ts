import { Message, MessageStub } from '../../types';
import { fromBase64, toBase64 } from '../../utils/base64';

export function serializeMessage(msg: MessageStub | Message): string | undefined {
  return toBase64(msg);
}

export function deSerializeMessage<M extends MessageStub>(data: string | string[]): M | undefined {
  return fromBase64<M>(data);
}
