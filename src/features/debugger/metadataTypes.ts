import type {
  ChainName,
  DerivedHookConfig,
  DerivedIsmConfig,
  DispatchedMessage,
  IsmType,
} from '@hyperlane-xyz/sdk';
import type { Address, SignatureLike } from '@hyperlane-xyz/utils';
import type { providers } from 'ethers';

export interface MetadataContext<IsmContext = DerivedIsmConfig, HookContext = DerivedHookConfig> {
  message: DispatchedMessage;
  dispatchTx: providers.TransactionReceipt;
  ism: IsmContext;
  hook: HookContext;
}

export const ValidatorStatus = {
  Signed: 'signed',
  Pending: 'pending',
  Error: 'error',
} as const;

export type ValidatorStatus = (typeof ValidatorStatus)[keyof typeof ValidatorStatus];

export interface ValidatorInfo {
  address: Address;
  alias?: string;
  status: ValidatorStatus;
  signature?: SignatureLike;
  checkpointIndex?: number;
  error?: string;
}

export interface BaseMetadataBuildResult {
  type: IsmType;
  ismAddress: Address;
  metadata?: string;
}

export interface MultisigMetadataBuildResult extends BaseMetadataBuildResult {
  threshold: number;
  validators: ValidatorInfo[];
  checkpointIndex: number;
}

export interface AggregationMetadataBuildResult extends BaseMetadataBuildResult {
  threshold: number;
  modules: MetadataBuildResult[];
}

export interface RoutingMetadataBuildResult extends BaseMetadataBuildResult {
  originChain: ChainName;
  selectedIsm: MetadataBuildResult;
}

export type MetadataBuildResult =
  | BaseMetadataBuildResult
  | MultisigMetadataBuildResult
  | AggregationMetadataBuildResult
  | RoutingMetadataBuildResult;

export interface MetadataBuilder {
  build(context: MetadataContext, maxDepth?: number): Promise<MetadataBuildResult>;
}
