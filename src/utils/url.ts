import { ChainNameOrId, MultiProtocolProvider } from '@hyperlane-xyz/sdk';
import { isZeroishAddress } from '@hyperlane-xyz/utils';

export async function tryGetBlockExplorerAddressUrl(
  multiProvider: MultiProtocolProvider,
  chain: ChainNameOrId,
  address: string,
) {
  return address && !isZeroishAddress(address)
    ? await multiProvider.tryGetExplorerAddressUrl(chain, address)
    : null;
}
