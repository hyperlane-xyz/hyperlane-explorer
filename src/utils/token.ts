import type { ChainMetadata } from '@hyperlane-xyz/sdk';
import type {
  TokenArgsWithWireDecimals,
  WarpRouteChainAddressMap,
  WarpRouteIdToAddressesMap,
} from '@hyperlane-xyz/sdk/warp/read';
import { addressToBytes32, isAddressEvm, objKeys, ProtocolType } from '@hyperlane-xyz/utils';

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

// Resolve the token on `otherChainName` that shares a warp route with an
// already-matched token (`matchedChainName` + `matchedAddressOrDenom`).
//
// Some legs cannot be matched by their on-chain sender/recipient address: for
// CosmosIbc / ibc-hyperlane routes the on-chain party is the hyperlane router
// app, which is unrelated to the registry key (an IBC denom such as `utia`).
// When the opposite leg matches by address we can still attribute the token by
// walking the route index from the matched leg to its counterpart.
//
// A single addressOrDenom can belong to multiple warp routes (shared
// collateral). To avoid mis-attribution we only resolve when exactly one route
// contains the matched leg AND covers both chains; otherwise we return
// undefined so callers fall back to rendering nothing.
export function getCounterpartTokenFromWarpRoute(
  matchedChainName: string,
  matchedAddressOrDenom: string,
  otherChainName: string,
  warpRouteChainAddressMap: WarpRouteChainAddressMap,
  warpRouteIdToAddressesMap: WarpRouteIdToAddressesMap,
): TokenArgsWithWireDecimals | undefined {
  const candidateOtherAddresses = new Set<string>();

  for (const tokens of Object.values(warpRouteIdToAddressesMap)) {
    const hasMatchedLeg = tokens.some(
      (t) => t.chainName === matchedChainName && t.address === matchedAddressOrDenom,
    );
    if (!hasMatchedLeg) continue;

    const otherLegs = tokens.filter((t) => t.chainName === otherChainName);
    // Disambiguate by requiring the route to cover both chains. A route that
    // contains the matched leg but not the other chain is the wrong transfer.
    if (otherLegs.length === 0) continue;

    for (const leg of otherLegs) candidateOtherAddresses.add(leg.address);
  }

  // 0 routes: not a known warp transfer. >1 distinct counterpart tokens:
  // ambiguous (shared collateral across routes), do not guess.
  if (candidateOtherAddresses.size !== 1) return undefined;

  const [otherAddress] = [...candidateOtherAddresses];
  return warpRouteChainAddressMap[otherChainName]?.[otherAddress];
}
