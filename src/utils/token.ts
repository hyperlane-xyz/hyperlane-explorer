import { ChainMetadata } from '@hyperlane-xyz/sdk';
import { objKeys } from '@hyperlane-xyz/utils';
import { WarpRouteChainAddressMap } from '../types';

export function getTokenSymbolFromWarpRouteChainAddressMap(
  chainMetadata: ChainMetadata,
  address: Address,
  warpRouteChainAddressMap: WarpRouteChainAddressMap,
) {
  const { name } = chainMetadata;
  if (objKeys(warpRouteChainAddressMap).includes(name)) {
    const chain = warpRouteChainAddressMap[name];
    if (objKeys(chain).includes(address)) {
      return chain[address];
    }
  }

  return undefined;
}
