import { logger } from '../../../utils/logger';

interface SealevelBalanceToken {
  chainName: string;
  addressOrDenom: string;
  standard?: string;
  collateralAddressOrDenom?: string;
}

export async function fetchSealevelWarpRouteBalance(
  token: SealevelBalanceToken,
): Promise<bigint | undefined> {
  const params = new URLSearchParams({
    chainName: token.chainName,
    addressOrDenom: token.addressOrDenom,
    standard: token.standard ?? '',
  });
  if (token.collateralAddressOrDenom)
    params.set('collateralAddressOrDenom', token.collateralAddressOrDenom);

  const response = await fetch(`/api/sealevel-warp-route-balance?${params.toString()}`);
  if (!response.ok) {
    logger.debug(`Sealevel balance API ${response.status} for ${token.chainName}`);
    return undefined;
  }
  const data: unknown = await response.json();
  if (!data || typeof data !== 'object') return undefined;
  const { balance } = data as Record<string, unknown>;
  return typeof balance === 'string' ? BigInt(balance) : undefined;
}
