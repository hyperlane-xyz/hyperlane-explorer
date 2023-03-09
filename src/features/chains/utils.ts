import { Environment } from '../../consts/environments';
import { getMultiProvider } from '../../multiProvider';

export function getChainDisplayName(chainId?: number, shortName = false) {
  if (!chainId) return 'Unknown';
  const metadata = getMultiProvider().getChainMetadata(chainId);
  const displayName = shortName ? metadata.displayNameShort : metadata.displayName;
  return displayName || metadata.name;
}

export function getChainEnvironment(chainIdOrName: number | string) {
  const isTestnet = getMultiProvider().getChainMetadata(chainIdOrName).isTestnet;
  return isTestnet ? Environment.Testnet : Environment.Mainnet;
}
