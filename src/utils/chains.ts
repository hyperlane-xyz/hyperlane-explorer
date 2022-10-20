import { chainIdToName } from '../consts/chains';

import { toTitleCase } from './string';

export function getChainDisplayName(chainId?: number) {
  if (!chainId) return 'Unknown';
  return toTitleCase(chainIdToName[chainId] || 'Unknown');
}
