import type { TokenStandard } from '@hyperlane-xyz/sdk/token/TokenStandard';
import type { WarpCoreConfig } from '@hyperlane-xyz/sdk/warp/types';

export interface WarpRouteEnrollment {
  chainName: string;
  addressOrDenom: string;
  symbol: string;
}

// Token info from registry for visualization
export interface WarpRouteTokenVisualization {
  // From WarpCoreConfig token
  chainName: string;
  addressOrDenom: string;
  symbol: string;
  decimals: number;
  standard?: TokenStandard;
  collateralAddressOrDenom?: string;
  enrollments: WarpRouteEnrollment[];
  logoURI?: string;
  // Balance data (fetched via adapters when expanded)
  collateralBalance?: bigint;
  isCollateralInsufficient?: boolean;
}

export function getWarpRouteTokenKey(
  token: Pick<WarpRouteTokenVisualization, 'chainName' | 'addressOrDenom'>,
): string {
  return `${token.chainName}:${token.addressOrDenom}`;
}

export interface WarpRouteVisualization {
  routeId: string;
  config: WarpCoreConfig;
  tokens: WarpRouteTokenVisualization[];
}

export interface ChainBalance {
  balance: bigint;
  xerc20Supply?: bigint; // total supply of xERC20 token
  lockboxBalance?: bigint; // lockbox balance (EvmHypXERC20Lockbox only)
}

export interface WarpRouteBalances {
  // Map of token key -> balance data
  balances: Record<string, ChainBalance>;
  isLoading: boolean;
  isFetching: boolean;
  error?: string;
  refetch: () => void;
}
