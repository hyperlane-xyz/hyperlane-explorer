import type { PartialTransactionReceipt } from '../../types';
import type { MessageDebugStatus } from '../debugger/debugMessage';

export enum MessageDeliveryStatus {
  Success = 'success',
  Failing = 'failing',
}

export interface MessageDeliverySuccessResult {
  status: MessageDeliveryStatus.Success;
  deliveryTransaction: PartialTransactionReceipt;
}

export interface MessageDeliveryFailingResult {
  status: MessageDeliveryStatus.Failing;
  debugStatus: MessageDebugStatus;
}

export type MessageDeliveryStatusResponse =
  | MessageDeliverySuccessResult
  | MessageDeliveryFailingResult;
