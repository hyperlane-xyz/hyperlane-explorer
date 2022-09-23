import { chainIdToChain } from '../consts/networksConfig';

export function getTxExplorerLink(chainId: number, hash?: string) {
  if (!chainId || !hash) return null;

  const chain = chainIdToChain[chainId];
  if (!chain?.blockExplorers) return null;

  if (chain.blockExplorers.etherscan) {
    return `${chain.blockExplorers.etherscan.url}/tx/${hash}`;
  }
  if (chain.blockExplorers.default) {
    return `${chain.blockExplorers.default.url}/tx/${hash}`;
  }
  return null;
}
