import { Environment } from '../../consts/environments';
import { getMultiProvider } from '../../multiProvider';
import { toTitleCase } from '../../utils/string';

export function getChainName(chainId?: number) {
  return getMultiProvider().tryGetChainName(chainId || 0) || undefined;
}

export function getChainDisplayName(chainId?: number, shortName = false) {
  const metadata = getMultiProvider().tryGetChainMetadata(chainId || 0);
  if (!metadata) return 'Unknown';
  const displayName = shortName ? metadata.displayNameShort : metadata.displayName;
  return toTitleCase(displayName || metadata.displayName || metadata.name);
}

export function getChainEnvironment(chainIdOrName: number | string) {
  const isTestnet = getMultiProvider().tryGetChainMetadata(chainIdOrName)?.isTestnet;
  return isTestnet ? Environment.Testnet : Environment.Mainnet;
}
