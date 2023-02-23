import { ChainName, Chains, CoreChainName, Mainnets, chainIdToMetadata } from '@hyperlane-xyz/sdk';

import { Environment } from '../consts/environments';

import { logger } from './logger';

export function getChainDisplayName(chainId?: number, shortName = false) {
  if (!chainId || !chainIdToMetadata[chainId]) return 'Unknown';
  const metadata = chainIdToMetadata[chainId];
  return shortName ? metadata.displayNameShort || metadata.displayName : metadata.displayName;
}

export function getChainEnvironment(chain: number | string) {
  let chainName: ChainName;
  if (typeof chain === 'number' && chainIdToMetadata[chain]) {
    chainName = chainIdToMetadata[chain].name;
  } else if (typeof chain === 'string' && Object.keys(Chains).includes(chain)) {
    chainName = chain as ChainName;
  } else {
    logger.error(`Cannot get environment for invalid chain ${chain}`);
    return Environment.Mainnet;
  }

  // TODO better PI support
  return Mainnets.includes(chainName as CoreChainName) ? Environment.Mainnet : Environment.Testnet;
}
