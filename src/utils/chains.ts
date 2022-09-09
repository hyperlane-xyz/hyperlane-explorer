import { allChains } from '../consts/networksConfig';

export function getChainName(chainId?: number) {
  if (!chainId) return 'unknown';
  return allChains.find((c) => c.id === chainId)?.name || 'unknown';
}
