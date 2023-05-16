export enum MessageDebugStatus {
  NoErrorsFound = 'noErrorsFound',
  RecipientNotContract = 'recipientNotContract',
  RecipientNotHandler = 'recipientNotHandler',
  IcaCallFailure = 'icaCallFailure',
  HandleCallFailure = 'handleCallFailure',
  MultisigIsmEmpty = 'multisigIsmEmpty',
  GasUnderfunded = 'gasUnderfunded',
}

export interface MessageDebugDetails {
  status: MessageDebugStatus;
  details: string;
  gasDetails?: {
    deliveryGasEstimate?: string;
    contractToPayments?: AddressTo<GasPayment[]>;
  };
}

export interface GasPayment {
  gasAmount: string;
  paymentAmount: string;
}
