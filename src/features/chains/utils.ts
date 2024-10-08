import { IRegistry } from '@hyperlane-xyz/registry';
import { ChainMap, ChainMetadata, MultiProvider } from '@hyperlane-xyz/sdk';
import { ProtocolType, toTitleCase } from '@hyperlane-xyz/utils';

import { Environment } from '../../consts/environments';

import { DomainsEntry } from './queries/fragments';

export async function getMailboxAddress(
  chainName: string,
  overrideChainMetadata: ChainMap<Partial<ChainMetadata<{ mailbox?: string }>>>,
  registry: IRegistry,
) {
  if (overrideChainMetadata[chainName]?.mailbox) return overrideChainMetadata[chainName].mailbox;
  const addresses = await registry.getChainAddresses(chainName);
  if (addresses?.mailbox) return addresses.mailbox;
  else return undefined;
}

export function getChainDisplayName(
  multiProvider: MultiProvider,
  chainOrDomainId?: ChainId | DomainId,
  shortName = false,
  fallbackToId = true,
): string {
  const metadata = multiProvider.tryGetChainMetadata(chainOrDomainId || 0);
  if (!metadata) return fallbackToId && chainOrDomainId ? chainOrDomainId.toString() : 'Unknown';
  const displayName = shortName ? metadata.displayNameShort : metadata.displayName;
  return toTitleCase(displayName || metadata.displayName || metadata.name);
}

export function getChainEnvironment(multiProvider: MultiProvider, chainIdOrName: number | string) {
  const isTestnet = multiProvider.tryGetChainMetadata(chainIdOrName)?.isTestnet;
  return isTestnet ? Environment.Testnet : Environment.Mainnet;
}

// Is a 'Permisionless Interop' chain (i.e. one not deployed and scraped by Abacus Works)
export function isPiChain(
  multiProvider: MultiProvider,
  scrapedChains: DomainsEntry[],
  chainIdOrName: number | string,
) {
  const chainName = multiProvider.tryGetChainName(chainIdOrName);
  // Note: .trim() because one chain name in the DB has a trailing \n char for some reason
  return !chainName || !scrapedChains.find((chain) => chain.name.trim() === chainName);
}

export function isEvmChain(multiProvider: MultiProvider, chainIdOrName: number | string) {
  const protocol = multiProvider.tryGetProtocol(chainIdOrName);
  return protocol === ProtocolType.Ethereum;
}
