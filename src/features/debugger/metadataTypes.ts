/**
 * Local type definitions for metadata build results.
 * These mirror the types in @hyperlane-xyz/relayer (metadata/types.ts) which are
 * not re-exported from the package's public API.
 * TODO: Remove once @hyperlane-xyz/relayer re-exports these from its index.
 */

import type { IsmType } from '@hyperlane-xyz/sdk';

export interface ValidatorInfo {
  address: string;
  alias?: string;
  status: 'signed' | 'pending' | 'error';
  signature?: string;
  checkpointIndex?: number;
  error?: string;
}

interface BaseMetadataBuildResult {
  type: IsmType;
  ismAddress: string;
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
  originChain: string;
  selectedIsm: MetadataBuildResult;
}

export type MetadataBuildResult =
  | MultisigMetadataBuildResult
  | AggregationMetadataBuildResult
  | RoutingMetadataBuildResult
  | BaseMetadataBuildResult;
