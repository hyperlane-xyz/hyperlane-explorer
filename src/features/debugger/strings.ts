import { MessageDebugStatus } from './types';

export const debugStatusToDesc: Record<MessageDebugStatus, string> = {
  [MessageDebugStatus.NoErrorsFound]: 'No errors found, message appears to be deliverable',
  [MessageDebugStatus.RecipientNotContract]: 'Recipient address is not a contract',
  [MessageDebugStatus.RecipientNotHandler]:
    'Recipient bytecode is missing handle function selector',
  [MessageDebugStatus.IcaCallFailure]: 'A call from the ICA account failed',
  [MessageDebugStatus.HandleCallFailure]: 'Error calling handle on the recipient contract',
  [MessageDebugStatus.GasUnderfunded]: 'Insufficient interchain gas has been paid for delivery',
};
