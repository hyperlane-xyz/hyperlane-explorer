import type { MessageStub } from '../../types';

export interface PiMessageSearchState {
  hasRun: boolean;
  isError: boolean;
  isFetching: boolean;
  isMessagesFound: boolean;
  messageList: MessageStub[];
}

export const DEFAULT_PI_MESSAGE_SEARCH_STATE: PiMessageSearchState = {
  hasRun: false,
  isError: false,
  isFetching: false,
  isMessagesFound: false,
  messageList: [],
};
