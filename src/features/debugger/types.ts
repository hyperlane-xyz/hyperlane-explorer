export enum MessageDebugStatus {
  AlreadyProcessed = 'alreadyProcessed',
  NoErrorsFound = 'noErrorsFound',
  RecipientNotContract = 'recipientNotContract',
  RecipientNotHandler = 'recipientNotHandler',
  IcaCallFailure = 'icaCallFailure',
  HandleCallFailure = 'handleCallFailure',
  GasUnderfunded = 'gasUnderfunded',
}

export interface MessageDebugDetails {
  status: MessageDebugStatus;
  details: string;
}
