export enum MessageDebugStatus {
  NoErrorsFound = 'noErrorsFound',
  RecipientNotContract = 'recipientNotContract',
  RecipientNotHandler = 'recipientNotHandler',
  IcaCallFailure = 'icaCallFailure',
  HandleCallFailure = 'handleCallFailure',
  MultisigIsmEmpty = 'multisigIsmEmpty',
  GasUnderfunded = 'gasUnderfunded',
}

export interface MessageDebugResult {
  status: MessageDebugStatus;
  description: string;
  gasDetails?: {
    deliveryGasEstimate?: string;
    contractToPayments?: AddressTo<GasPayment[]>;
  };
  ismDetails?: {
    ismAddress: Address;
    moduleType: IsmModuleTypes;
  };
  calldataDetails?: {
    handleCalldata: HexString;
    contract: Address;
    mailbox: Address;
  };
}

export interface GasPayment {
  gasAmount: string;
  paymentAmount: string;
}

// Must match https://github.com/hyperlane-xyz/hyperlane-monorepo/blob/main/solidity/contracts/interfaces/IInterchainSecurityModule.sol#L5
export enum IsmModuleTypes {
  UNUSED,
  ROUTING,
  AGGREGATION,
  LEGACY_MULTISIG,
  MULTISIG,
}
