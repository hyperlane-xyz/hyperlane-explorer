export enum MessageDebugStatus {
  NoErrorsFound = 'noErrorsFound',
  RecipientNotContract = 'recipientNotContract',
  RecipientNotHandler = 'recipientNotHandler',
  IcaCallFailure = 'icaCallFailure',
  HandleCallFailure = 'handleCallFailure',
  MultisigIsmEmpty = 'multisigIsmEmpty',
  GasUnderfunded = 'gasUnderfunded',
  InvalidIsmDefinition = 'invalidIsmDefinition',
}

export interface MessageDebugResult {
  status: MessageDebugStatus;
  description: string;
  gasDetails?: {
    deliveryGasEstimate?: string;
    contractToPayments?: AddressTo<GasPayment[]>;
  };
  calldataDetails?: {
    handleCalldata: HexString;
    contract: Address;
    mailbox: Address;
  };
  icaDetails?: {
    failedCallIndex: number; // 0-based index of the failed call
    totalCalls: number;
    errorReason: string;
  };
}

export interface GasPayment {
  gasAmount: string;
  paymentAmount: string;
}
