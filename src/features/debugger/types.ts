export enum TxDebugStatus {
  NotFound = 'notFound',
  NoMessages = 'noMessages',
  MessagesFound = 'messagesFound',
}

export enum MessageDebugStatus {
  AlreadyProcessed = 'alreadyProcessed',
  NoErrorsFound = 'noErrorsFound',
  InvalidDestDomain = 'invalidDestDomain',
  UnknownDestChain = 'unknownDestChain',
  RecipientNotContract = 'recipientNotContract',
  RecipientNotHandler = 'recipientNotHandler',
  IcaCallFailure = 'icaCallFailure',
  HandleCallFailure = 'handleCallFailure',
  GasUnderfunded = 'gasUnderfunded',
}

export interface DebugNotFoundResult {
  status: TxDebugStatus.NotFound;
  details: string;
}

export interface DebugNoMessagesResult {
  status: TxDebugStatus.NoMessages;
  chainName: string;
  details: string;
  explorerLink?: string;
}

export interface LinkProperty {
  url: string;
  text: string;
}

export interface MessageDebugDetails {
  status: MessageDebugStatus;
  properties: Map<string, string | LinkProperty>;
  details: string;
}

export interface DebugMessagesFoundResult {
  status: TxDebugStatus.MessagesFound;
  chainName: string;
  explorerLink?: string;
  messageDetails: MessageDebugDetails[];
}

export type MessageDebugResult =
  | DebugNotFoundResult
  | DebugNoMessagesResult
  | DebugMessagesFoundResult;
