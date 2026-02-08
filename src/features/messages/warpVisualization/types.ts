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
  // Balance data (fetched via adapters when expanded)
  collateralBalance?: bigint;
  isCollateralInsufficient?: boolean;
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
