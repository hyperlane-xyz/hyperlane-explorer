import type { ChainMetadata } from '@hyperlane-xyz/sdk';
import type { WarpRouteChainAddressMap } from '@hyperlane-xyz/sdk/warp/read';
import { addressToBytes32, isAddressEvm, objKeys, ProtocolType } from '@hyperlane-xyz/utils';

// Normalize an address to lowercase bytes32 hex so registry keys and
// resolved message addresses can be compared regardless of source form.
// Tron warp routes are stored in the registry as EVM-shaped hex (`0x...`);
// recipients reaching this code have already been decoded to protocol-native
// form (e.g. base58 for Tron). Both decode to the same 20-byte payload.
function tryToCanonicalBytes32(address: string, protocol: ProtocolType): string | undefined {
  try {
    const sourceProtocol = isAddressEvm(address) ? ProtocolType.Ethereum : protocol;
    return addressToBytes32(address, sourceProtocol).toLowerCase();
  } catch {
    return undefined;
  }
}

export function getTokenFromWarpRouteChainAddressMap(
  chainMetadata: ChainMetadata,
  address: Address,
  warpRouteChainAddressMap: WarpRouteChainAddressMap,
) {
  const { name, protocol } = chainMetadata;
  const chain = warpRouteChainAddressMap[name];
  if (!chain) return undefined;

  const normalizedAddress = tryToCanonicalBytes32(address, protocol);

  for (const tokenAddress of objKeys(chain)) {
    const normalizedKey = tryToCanonicalBytes32(tokenAddress, protocol);
    if (normalizedAddress && normalizedKey && normalizedAddress === normalizedKey) {
      return chain[tokenAddress];
    }
    // Fallback for non-address denoms (e.g. IBC denoms) that can't be canonicalized.
    if (!normalizedKey && tokenAddress.endsWith(address)) {
      return chain[tokenAddress];
    }
  }

  return undefined;
}
