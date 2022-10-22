import { MessageDebugStatus } from './types';

export const debugStatusToDesc: Record<MessageDebugStatus, string> = {
  [MessageDebugStatus.AlreadyProcessed]: 'No errors found, message already processed',
  [MessageDebugStatus.NoErrorsFound]: 'No errors found, message appears to be deliverable.',
  [MessageDebugStatus.InvalidDestDomain]: 'The destination domain id is invalid.',
  [MessageDebugStatus.UnknownDestChain]: `Destination chain is not included in this message's environment.`,
  [MessageDebugStatus.RecipientNotContract]: 'Recipient address is not a contract.',
  [MessageDebugStatus.RecipientNotHandler]:
    'Recipient bytecode does not contain handle function selector',
  [MessageDebugStatus.HandleCallFailure]: 'Error calling handle on the recipient contract',
};
