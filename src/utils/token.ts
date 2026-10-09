import type { ChainMetadata } from '@hyperlane-xyz/sdk';
import type {
  TokenArgsWithWireDecimals,
  WarpRouteChainAddressMap,
} from '@hyperlane-xyz/sdk/warp/read';
import {
  addressToBytes32,
  eqAddressEvm,
  isAddressEvm,
  objKeys,
  ProtocolType,
} from '@hyperlane-xyz/utils';

// Normalize an address to lowercase bytes32 hex so registry keys and
// resolved message addresses can be compared regardless of source form.
// Tron warp routes are stored in the registry as EVM-shaped hex (`0x...`);
// recipients reaching this code have already been decoded to protocol-native
// form (e.g. base58 for Tron). Both decode to the same 20-byte payload.
function toCanonicalBytes32OrUndefined(
  address: string,
  protocol: ProtocolType,
): string | undefined {
  try {
    // Shape-based: 20-byte hex is decoded as EVM even on non-EVM chains
    // because some registry entries, notably Tron, are stored in that form.
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

  const normalizedAddress = toCanonicalBytes32OrUndefined(address, protocol);

  for (const tokenAddress of objKeys(chain)) {
    const normalizedKey = toCanonicalBytes32OrUndefined(tokenAddress, protocol);
    if (normalizedAddress && normalizedKey && normalizedAddress === normalizedKey) {
      return chain[tokenAddress];
    }
    // Fallback for non-address denoms (e.g. IBC denoms) that can't be canonicalized.
    // If the registry key is a valid address but lookup input is malformed, do not match.
    if (!normalizedKey && tokenAddress.endsWith(address)) {
      return chain[tokenAddress];
    }
  }

  return undefined;
}

// Finds the registry token whose underlying ERC20 is `tokenAddress`. Unlike
// getTokenFromWarpRouteChainAddressMap this matches the collateral (or synthetic) token
// itself rather than the router, and prefers an entry that carries a coinGeckoId.
export function findErc20TokenInWarpRouteChainAddressMap(
  chainName: string,
  tokenAddress: Address,
  warpRouteChainAddressMap: WarpRouteChainAddressMap,
): TokenArgsWithWireDecimals | undefined {
  const chain = warpRouteChainAddressMap[chainName];
  if (!chain) return undefined;

  let match: TokenArgsWithWireDecimals | undefined;
  for (const token of Object.values(chain)) {
    const erc20Address = token.collateralAddressOrDenom ?? token.addressOrDenom;
    if (!isAddressEvm(erc20Address) || !eqAddressEvm(erc20Address, tokenAddress)) continue;
    if (token.coinGeckoId) return token;
    match ??= token;
  }
  return match;
}
