import { ChainNameOrId, MultiProvider } from '@hyperlane-xyz/sdk';
import { isZeroishAddress } from '@hyperlane-xyz/utils';

export async function tryGetBlockExplorerAddressUrl(
  multiProvider: MultiProvider,
  chain: ChainNameOrId,
  address: string,
) {
  return address && !isZeroishAddress(address)
    ? await multiProvider.tryGetExplorerAddressUrl(chain, address)
    : null;
}
