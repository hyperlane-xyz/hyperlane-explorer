import { chainIdToChain } from '../../consts/networksConfig';
import { isValidAddressFast, isValidTransactionHash } from '../../utils/addresses';

export function isValidSearchQuery(input: string, allowAddress?: boolean) {
  if (!input) return false;
  if (isValidTransactionHash(input)) return true;
  if (allowAddress && isValidAddressFast(input)) return true;
  return false;
}

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
