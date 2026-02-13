import { ChainMetadata } from '@hyperlane-xyz/sdk';
import { objKeys } from '@hyperlane-xyz/utils';
import { WarpRouteChainAddressMap } from '../types';

export function getTokenFromWarpRouteChainAddressMap(
  chainMetadata: ChainMetadata,
  address: Address,
  warpRouteChainAddressMap: WarpRouteChainAddressMap,
) {
  const { name } = chainMetadata;
  if (objKeys(warpRouteChainAddressMap).includes(name)) {
    const chain = warpRouteChainAddressMap[name];
    for (const tokenAddress of objKeys(chain)) {
      // There are cases where the chain record has some prefix to the token address, so we only check if the token address ends with the address we're looking for
      if (tokenAddress.endsWith(address)) {
        return chain[tokenAddress];
      }
    }
  }

  return undefined;
}
