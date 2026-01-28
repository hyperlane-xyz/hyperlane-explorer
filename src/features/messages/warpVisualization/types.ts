import { TokenStandard, WarpCoreConfig } from '@hyperlane-xyz/sdk';

// Extended token info with runtime-fetched data for visualization
export interface WarpRouteTokenVisualization {
  // From WarpCoreConfig token
  chainName: string;
  addressOrDenom: string;
  symbol: string;
  decimals: number;
  standard?: TokenStandard;
  logoURI?: string;
  // Fetched via EvmERC20WarpRouteReader.deriveWarpRouteConfig()
  tokenType?: string; // TokenType from SDK (synthetic, collateral, native, etc.)
  owner?: string;
  // Fee config (simplified display)
  feeType?: string; // LinearFee, RoutingFee, etc.
  feeBps?: number; // Basis points for linear fees
  // Collateral balance (for collateral-type tokens)
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
  refresh: () => void;
}
