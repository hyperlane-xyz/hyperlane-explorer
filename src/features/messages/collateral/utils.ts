import { warpRouteConfigs } from '@hyperlane-xyz/registry';
import { TOKEN_COLLATERALIZED_STANDARDS } from '@hyperlane-xyz/sdk/token/TokenStandard';

import { CCTP_WARP_ROUTE_IDS, CollateralInfo, CollateralStatus } from './types';

// Build a set of CCTP route addresses from the registry
let cctpAddresses: Set<string> | undefined;
function getCctpAddresses(): Set<string> {
  if (cctpAddresses) return cctpAddresses;

  cctpAddresses = new Set();
  for (const routeId of CCTP_WARP_ROUTE_IDS) {
    const config = warpRouteConfigs[routeId];
    if (config?.tokens) {
      for (const token of config.tokens) {
        if (token.addressOrDenom) {
          cctpAddresses.add(token.addressOrDenom.toLowerCase());
        }
      }
    }
  }
  return cctpAddresses;
}

export function isCctpRoute(addressOrDenom?: string): boolean {
  if (!addressOrDenom) return false;
  const cctpAddrs = getCctpAddresses();
  return cctpAddrs.has(addressOrDenom.toLowerCase());
}

export function calculateCollateralStatus(available: bigint, required: bigint): CollateralInfo {
  if (available < required) {
    return {
      status: CollateralStatus.Insufficient,
      available,
      required,
      deficit: required - available,
    };
  }

  return {
    status: CollateralStatus.Sufficient,
    available,
    required,
  };
}

// Checks if a token standard is collateralized using SDK's official list
// WORKAROUND: SDK is missing Starknet collateral standards from TOKEN_COLLATERALIZED_STANDARDS
// TODO: Remove this workaround once SDK is fixed
const STARKNET_COLLATERAL_STANDARDS = ['StarknetHypCollateral', 'StarknetHypNative'];
// WORKAROUND: Cardano standards ship with the cardano protocol changeset
// (TokenStandard.CardanoHyp*); until this app's SDK version carries them,
// recognize them the same way as the Starknet ones above.
// TODO: Remove once the SDK dependency includes the cardano standards
const CARDANO_COLLATERAL_STANDARDS = ['CardanoHypNative', 'CardanoHypCollateral'];
export function isCollateralRoute(tokenStandard?: string): boolean {
  if (!tokenStandard) return false;
  // Check SDK's official list first
  if (TOKEN_COLLATERALIZED_STANDARDS.some((standard) => standard === tokenStandard)) {
    return true;
  }
  // WORKAROUND: Also check for Starknet and Cardano collateral standards
  return (
    STARKNET_COLLATERAL_STANDARDS.includes(tokenStandard) ||
    CARDANO_COLLATERAL_STANDARDS.includes(tokenStandard)
  );
}
