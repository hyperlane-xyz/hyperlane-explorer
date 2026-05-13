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
  ismDetails?: {
    ismAddress: Address;
    moduleType: IsmModuleTypes;
    metadata?: IsmMetadataDetails;
    route?: IsmRouteModule;
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

export interface IsmMetadataDetails {
  raw: HexString;
  length: number;
  format?: 'messageIdMultisig' | 'merkleRootMultisig' | 'aggregation' | 'unknown';
  originMerkleTreeHook?: HexString;
  root?: HexString;
  index?: number;
  messageIndex?: number;
  signedMessageId?: HexString;
  signedIndex?: number;
  signatureCount?: number;
  proof?: HexString[];
  ranges?: IsmMetadataRange[];
}

export interface IsmMetadataRange {
  start: number;
  end: number;
  hasMetadata: boolean;
}

export interface IsmRouteModule {
  address: Address;
  moduleType?: IsmModuleTypes;
  threshold?: number;
  validators?: Address[];
  multisigResolved?: boolean;
  metadata?: IsmMetadataDetails;
  children?: IsmRouteModule[];
}

// Must match https://github.com/hyperlane-xyz/hyperlane-monorepo/blob/main/solidity/contracts/interfaces/IInterchainSecurityModule.sol#L5
export enum IsmModuleTypes {
  UNUSED,
  ROUTING,
  AGGREGATION,
  LEGACY_MULTISIG,
  MULTISIG,
}
