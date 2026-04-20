import type { Message } from '../../types';

export interface PiMessageDetailsState {
  hasRun: boolean;
  isError: boolean;
  isFetching: boolean;
  isMessageFound: boolean;
  message: Message | null;
}

export const DEFAULT_PI_MESSAGE_DETAILS_STATE: PiMessageDetailsState = {
  hasRun: false,
  isError: false,
  isFetching: false,
  isMessageFound: false,
  message: null,
};
