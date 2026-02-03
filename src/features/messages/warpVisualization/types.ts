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

export interface WarpRouteBalances {
  // Map of chainName -> balance
  balances: Record<string, bigint>;
  isLoading: boolean;
  error?: string;
  refetch: () => void;
}
