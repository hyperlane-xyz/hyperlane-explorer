import type { Message } from '../../types';

export interface TransactionFallbackState {
  hasRun: boolean;
  isFetching: boolean;
  messageList: Message[];
}

export const DEFAULT_TRANSACTION_FALLBACK_STATE: TransactionFallbackState = {
  hasRun: false,
  isFetching: false,
  messageList: [],
};
