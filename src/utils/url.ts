import { ChainNameOrId, MultiProvider } from '@hyperlane-xyz/sdk';
import BigNumber from 'bignumber.js';

export async function tryGetBlockExplorerAddressUrl(
  multiProvider: MultiProvider,
  chain: ChainNameOrId,
  address: string,
) {
  return address && !new BigNumber(address).isZero()
    ? await multiProvider.tryGetExplorerAddressUrl(chain, address)
    : null;
}
