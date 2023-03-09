import { Message, MessageStub } from '../../types';
import { logger } from '../../utils/logger';

export function serializeMessage(msg: MessageStub | Message): string | undefined {
  try {
    return btoa(JSON.stringify(msg));
  } catch (error) {
    logger.error('Unable to serialize msg', msg);
    return undefined;
  }
}

export function deSerializeMessage(data: string | string[]): Message | undefined {
  try {
    const msg = Array.isArray(data) ? data[0] : data;
    return JSON.parse(atob(msg));
  } catch (error) {
    logger.error('Unable to deserialize msg', data);
    return undefined;
  }
}
