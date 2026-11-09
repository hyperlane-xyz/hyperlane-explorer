import type { Message, MessageStatus } from '../../types';
import type { MessageDebugResult } from '../debugger/types';

interface MessageDeliveryResult {
  status: MessageStatus;
}

export interface MessageDeliverySuccessResult extends MessageDeliveryResult {
  status: MessageStatus.Delivered;
  deliveryTransaction: NonNullable<Message['destination']>;
}

export interface MessageDeliveryFailingResult extends MessageDeliveryResult {
  status: MessageStatus.Failing;
  debugResult: MessageDebugResult;
}

export interface MessageDeliveryPendingResult extends MessageDeliveryResult {
  status: MessageStatus.Pending;
  debugResult: MessageDebugResult;
}

export type MessageDeliveryStatusResponse =
  | MessageDeliverySuccessResult
  | MessageDeliveryFailingResult
  | MessageDeliveryPendingResult;
