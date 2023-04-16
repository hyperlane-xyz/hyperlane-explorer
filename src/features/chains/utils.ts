import { MultiProvider } from '@hyperlane-xyz/sdk';

import { Environment } from '../../consts/environments';
import { toTitleCase } from '../../utils/string';

export function getChainName(mp: MultiProvider, chainId?: number) {
  return mp.tryGetChainName(chainId || 0) || undefined;
}

export function getChainDisplayName(mp: MultiProvider, chainId?: number, shortName = false) {
  const metadata = mp.tryGetChainMetadata(chainId || 0);
  if (!metadata) return 'Unknown';
  const displayName = shortName ? metadata.displayNameShort : metadata.displayName;
  return toTitleCase(displayName || metadata.displayName || metadata.name);
}

export function getChainEnvironment(mp: MultiProvider, chainIdOrName: number | string) {
  const isTestnet = mp.tryGetChainMetadata(chainIdOrName)?.isTestnet;
  return isTestnet ? Environment.Testnet : Environment.Mainnet;
}
