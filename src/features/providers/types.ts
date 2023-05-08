import type { utils } from 'ethers';

import type { ChainMetadata } from '@hyperlane-xyz/sdk';

export type RpcConfigWithConnectionInfo = ChainMetadata['publicRpcUrls'][number] & {
  connection?: utils.ConnectionInfo;
};

export interface ChainMetadataWithRpcConnectionInfo extends ChainMetadata {
  publicRpcUrls: RpcConfigWithConnectionInfo[];
}

export enum ProviderStatus {
  Success = 'success',
  Error = 'error',
  Timeout = 'timeout',
}

export interface ProviderPerformResultBase {
  status: ProviderStatus;
}

export interface ProviderSuccessResult extends ProviderPerformResultBase {
  status: ProviderStatus.Success;
  value: any;
}

export interface ProviderErrorResult extends ProviderPerformResultBase {
  status: ProviderStatus.Error;
  error: unknown;
}

export interface ProviderTimeoutResult extends ProviderPerformResultBase {
  status: ProviderStatus.Timeout;
}

export type ProviderPerformResult =
  | ProviderSuccessResult
  | ProviderErrorResult
  | ProviderTimeoutResult;
