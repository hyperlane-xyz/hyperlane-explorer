import {
  type ChainMap,
  type ChainName,
  type MultiProvider,
  chainIdToMetadata,
  hyperlaneContractAddresses,
} from '@hyperlane-xyz/sdk';

import { Environment } from '../../consts/environments';
import { toTitleCase } from '../../utils/string';

import type { ChainConfig } from './chainConfig';

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

export function tryGetContractAddress(
  customChainConfigs: ChainMap<ChainConfig>,
  chainName: ChainName,
  contractName: keyof ChainConfig['contracts'],
): Address | undefined {
  return (
    customChainConfigs[chainName]?.contracts?.[contractName] ||
    hyperlaneContractAddresses[chainName]?.[contractName] ||
    undefined
  );
}

export function getContractAddress(
  customChainConfigs: ChainMap<ChainConfig>,
  chainName: ChainName,
  contractName: keyof ChainConfig['contracts'],
): Address {
  const addr = tryGetContractAddress(customChainConfigs, chainName, contractName);
  if (!addr) throw new Error(`No contract address found for ${contractName} on ${chainName}`);
  return addr;
}

export function isPiChain(chainId: number) {
  return !chainIdToMetadata[chainId];
}
