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

// Validator signature status for multisig ISMs
export interface ValidatorStatus {
  address: Address;
  alias?: string;
  status: 'signed' | 'pending' | 'error';
  error?: string;
}

// Detailed ISM information including validator status
export interface IsmDetails {
  ismAddress: Address;
  moduleType: IsmModuleTypes;
  // Multisig-specific fields
  threshold?: number;
  validators?: ValidatorStatus[];
  checkpointIndex?: number;
  // For aggregation ISMs
  subModules?: IsmDetails[];
  // For routing ISMs
  selectedModule?: IsmDetails;
}

export interface MessageDebugResult {
  status: MessageDebugStatus;
  description: string;
  gasDetails?: {
    deliveryGasEstimate?: string;
    contractToPayments?: AddressTo<GasPayment[]>;
  };
  ismDetails?: IsmDetails;
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
