import type { utils } from 'ethers';

import type { ChainMetadata } from '@hyperlane-xyz/sdk';

export type RpcConfigWithConnectionInfo = ChainMetadata['publicRpcUrls'][number] & {
  connection?: utils.ConnectionInfo;
};

export interface ChainMetadataWithRpcConnectionInfo extends ChainMetadata {
  publicRpcUrls: RpcConfigWithConnectionInfo[];
}
