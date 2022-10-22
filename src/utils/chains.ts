import { ChainName, Chains } from '@hyperlane-xyz/sdk';
import { Mainnets } from '@hyperlane-xyz/sdk/dist/consts/chains';

import { chainIdToName } from '../consts/chains';
import { Environment } from '../consts/environments';

import { logger } from './logger';
import { toTitleCase } from './string';

export function getChainDisplayName(chainId?: number) {
  if (!chainId) return 'Unknown';
  return toTitleCase(chainIdToName[chainId] || 'Unknown');
}

export function getChainEnvironment(chain: number | string) {
  let chainName: ChainName;
  if (typeof chain === 'number' && chainIdToName[chain]) {
    chainName = chainIdToName[chain];
  } else if (typeof chain === 'string' && Object.keys(Chains).includes(chain)) {
    chainName = chain as ChainName;
  } else {
    logger.error(`Cannot get environment for invalid chain ${chain}`);
    return Environment.Mainnet;
  }

  return Mainnets.includes(chainName) ? Environment.Mainnet : Environment.Testnet2;
}
