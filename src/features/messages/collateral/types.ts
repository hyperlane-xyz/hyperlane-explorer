export enum CollateralStatus {
  Unknown = 'unknown',
  Checking = 'checking',
  Sufficient = 'sufficient',
  Insufficient = 'insufficient',
}

export interface CollateralInfo {
  status: CollateralStatus;
  available?: bigint;
  required?: bigint;
  deficit?: bigint;
}

export interface RebalanceInfo {
  messageId: string;
  amount: bigint;
  originChain: string;
  destinationChain: string;
  timestamp: number;
  txHash: string;
  isDelivered: boolean;
}

export interface ActiveRebalance {
  rebalances: RebalanceInfo[];
  totalInFlight: bigint;
}

// CCTP (Circle Cross-Chain Transfer Protocol) warp route IDs
// These routes use Circle's CCTP burn/mint mechanism instead of traditional collateral
export const CCTP_WARP_ROUTE_IDS = [
  'USDC/mainnet-cctp',
  'USDC/mainnet-cctp-v2-fast',
  'USDC/mainnet-cctp-v2-standard',
];
