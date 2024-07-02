import { CoreChain, CoreChains, IRegistry } from '@hyperlane-xyz/registry';
import { ChainMap, MultiProvider } from '@hyperlane-xyz/sdk';
import { ProtocolType, toTitleCase } from '@hyperlane-xyz/utils';

import { unscrapedEvmChains } from '../../consts/config';
import { Environment } from '../../consts/environments';

import { ChainConfig } from './chainConfig';

export async function getMailboxAddress(
  chainName: string,
  customChainConfigs: ChainMap<ChainConfig>,
  registry: IRegistry,
) {
  if (customChainConfigs[chainName]?.mailbox) return customChainConfigs[chainName].mailbox;
  const addresses = await registry.getChainAddresses(chainName);
  if (addresses?.mailbox) return addresses.mailbox;
  else return undefined;
}

export function getChainDisplayName(
  multiProvider: MultiProvider,
  chainOrDomainId?: ChainId | DomainId,
  shortName = false,
  fallbackToId = true,
) {
  const metadata = multiProvider.tryGetChainMetadata(chainOrDomainId || 0);
  if (!metadata) return fallbackToId && chainOrDomainId ? chainOrDomainId : 'Unknown';
  const displayName = shortName ? metadata.displayNameShort : metadata.displayName;
  return toTitleCase(displayName || metadata.displayName || metadata.name);
}

export function getChainEnvironment(multiProvider: MultiProvider, chainIdOrName: number | string) {
  const isTestnet = multiProvider.tryGetChainMetadata(chainIdOrName)?.isTestnet;
  return isTestnet ? Environment.Testnet : Environment.Mainnet;
}

export function isPiChain(multiProvider: MultiProvider, chainIdOrName: number | string) {
  const chainName = multiProvider.tryGetChainName(chainIdOrName);
  return !chainName || !CoreChains.includes(chainName as CoreChain);
}

export function isEvmChain(multiProvider: MultiProvider, chainIdOrName: number | string) {
  const protocol = multiProvider.tryGetProtocol(chainIdOrName);
  return protocol === ProtocolType.Ethereum;
}
export function isUnscrapedEvmChain(multiProvider: MultiProvider, chainIdOrName: number | string) {
  const chainName = multiProvider.tryGetChainName(chainIdOrName);
  return chainName && unscrapedEvmChains.includes(chainName as CoreChain);
}
