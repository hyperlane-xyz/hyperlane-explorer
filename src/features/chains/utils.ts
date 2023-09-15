import { type MultiProvider, chainIdToMetadata } from '@hyperlane-xyz/sdk';
import { toTitleCase } from '@hyperlane-xyz/utils';

import { Environment } from '../../consts/environments';

export function getChainName(mp: MultiProvider, chainId?: number) {
  return mp.tryGetChainName(chainId || 0) || undefined;
}

export function getChainDisplayName(
  mp: MultiProvider,
  chainOrDomainId?: ChainId | DomainId,
  shortName = false,
  fallbackToId = true,
) {
  const metadata = mp.tryGetChainMetadata(chainOrDomainId || 0);
  if (!metadata) return fallbackToId && chainOrDomainId ? chainOrDomainId : 'Unknown';
  const displayName = shortName ? metadata.displayNameShort : metadata.displayName;
  return toTitleCase(displayName || metadata.displayName || metadata.name);
}

export function getChainEnvironment(mp: MultiProvider, chainIdOrName: number | string) {
  const isTestnet = mp.tryGetChainMetadata(chainIdOrName)?.isTestnet;
  return isTestnet ? Environment.Testnet : Environment.Mainnet;
}

export function isPiChain(chainId: number) {
  return !chainIdToMetadata[chainId];
}
