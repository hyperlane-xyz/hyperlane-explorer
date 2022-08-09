import { allChains } from '../consts/networksConfig';

export function getChainName(chainId: number) {
  return allChains.find((c) => c.id === chainId)?.name || 'unknown';
}
