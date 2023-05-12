import type { MessageStatus, MessageTx } from '../../types';
import type { MessageDebugDetails, MessageDebugStatus } from '../debugger/types';

interface MessageDeliveryResult {
  status: MessageStatus;
}

export interface MessageDeliverySuccessResult extends MessageDeliveryResult {
  status: MessageStatus.Delivered;
  deliveryTransaction: MessageTx;
}

export interface MessageDeliveryFailingResult extends MessageDeliveryResult {
  status: MessageStatus.Failing;
  debugStatus: MessageDebugStatus;
  debugDetails: string;
  gasDetails: MessageDebugDetails['gasDetails'];
}

export interface MessageDeliveryPendingResult extends MessageDeliveryResult {
  status: MessageStatus.Pending;
  debugStatus: MessageDebugStatus;
  debugDetails: string;
  gasDetails: MessageDebugDetails['gasDetails'];
}

export type MessageDeliveryStatusResponse =
  | MessageDeliverySuccessResult
  | MessageDeliveryFailingResult
  | MessageDeliveryPendingResult;
