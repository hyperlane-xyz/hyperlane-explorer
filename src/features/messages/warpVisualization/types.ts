import { TokenStandard, WarpCoreConfig } from '@hyperlane-xyz/sdk';

// Token info from registry for visualization
export interface WarpRouteTokenVisualization {
  // From WarpCoreConfig token
  chainName: string;
  addressOrDenom: string;
  symbol: string;
  decimals: number;
  standard?: TokenStandard;
  logoURI?: string;
  collateralAddressOrDenom?: string;
  // Cross-collateral sub-route enrollments. Each entry is the
  // `protocol|chainName|addressOrDenom` token reference parsed from
  // the WarpCoreConfig token's `connections` field. Named distinctly
  // from `connections` so this shape stays compatible with the SDK's
  // HypTokenAdapterInput when passed to adapter factories.
  enrollments?: TokenConnectionRef[];
  // Balance data (fetched via adapters when expanded)
  collateralBalance?: bigint;
  isCollateralInsufficient?: boolean;
}

// Parsed `protocol|chainName|address` connection reference.
export interface TokenConnectionRef {
  raw: string;
  protocol: string;
  chainName: string;
  addressOrDenom: string;
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
  // Map of chainName -> balance data
  balances: Record<string, ChainBalance>;
  isLoading: boolean;
  error?: string;
  refetch: () => void;
}
