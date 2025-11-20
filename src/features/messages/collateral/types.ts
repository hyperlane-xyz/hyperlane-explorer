import { TOKEN_COLLATERALIZED_STANDARDS } from '@hyperlane-xyz/sdk';

export enum CollateralStatus {
  Unknown = 'unknown',
  Checking = 'checking',
  Sufficient = 'sufficient',
  Low = 'low',
  Insufficient = 'insufficient',
}

export interface CollateralInfo {
  status: CollateralStatus;
  available?: bigint;
  required?: bigint;
  deficit?: bigint;
  utilizationPercent?: number;
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

// Checks if a token standard is collateralized using SDK's official list
// WORKAROUND: SDK is missing Starknet collateral standards from TOKEN_COLLATERALIZED_STANDARDS
// TODO: Remove this workaround once SDK is fixed
const STARKNET_COLLATERAL_STANDARDS = ['StarknetHypCollateral', 'StarknetHypNative'];

export function isCollateralRoute(tokenStandard?: string): boolean {
  if (!tokenStandard) return false;

  // Check SDK's official list first
  if (TOKEN_COLLATERALIZED_STANDARDS.some((standard) => standard === tokenStandard)) {
    return true;
  }

  // WORKAROUND: Also check for Starknet collateral standards
  return STARKNET_COLLATERAL_STANDARDS.includes(tokenStandard);
}

export function calculateCollateralStatus(available: bigint, required: bigint): CollateralInfo {
  if (available < required) {
    return {
      status: CollateralStatus.Insufficient,
      available,
      required,
      deficit: required - available,
      utilizationPercent: Number((available * 10000n) / required) / 100,
    };
  }

  const utilizationPercent = Number((required * 10000n) / available) / 100;

  // Warn if over 80% utilized
  if (utilizationPercent > 80) {
    return {
      status: CollateralStatus.Low,
      available,
      required,
      utilizationPercent,
    };
  }

  return {
    status: CollateralStatus.Sufficient,
    available,
    required,
    utilizationPercent,
  };
}

const TEN_POWER: Record<number, bigint> = {
  18: 1000000000000000000n,
  6: 1000000n,
  8: 100000000n,
  9: 1000000000n,
};

export function formatCollateralAmount(amount: bigint, decimals: number): string {
  // Use precomputed powers or calculate if not available
  const divisor = TEN_POWER[decimals] || BigInt(10 ** decimals);
  const whole = amount / divisor;
  const remainder = amount % divisor;
  const fractional = remainder.toString().padStart(decimals, '0').slice(0, 2);
  return `${whole.toLocaleString()}.${fractional}`;
}
