import type { IRegistry } from '@hyperlane-xyz/registry';
import type { ChainMap, ChainMetadata } from '@hyperlane-xyz/sdk';
import type { ChainMetadataResolver } from '@hyperlane-xyz/sdk/metadata/ChainMetadataResolver';
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
  chainMetadataResolver: Pick<ChainMetadataResolver, 'tryGetChainMetadata'>,
  chainName?: string,
  shortName = false,
  fallbackToId = true,
): string {
  const metadata = chainMetadataResolver.tryGetChainMetadata(chainName || 0);
  if (!metadata) return fallbackToId && chainName ? chainName : 'Unknown';
  const displayName = shortName ? metadata.displayNameShort : metadata.displayName;
  return displayName || metadata.displayName || toTitleCase(metadata.name);
}

export function getChainEnvironment(
  chainMetadataResolver: Pick<ChainMetadataResolver, 'tryGetChainMetadata'>,
  domainId: DomainId,
) {
  const isTestnet = chainMetadataResolver.tryGetChainMetadata(domainId)?.isTestnet;
  return isTestnet ? Environment.Testnet : Environment.Mainnet;
}

// Is a 'Permissionless Interop' chain (i.e. one not deployed and scraped by Abacus Works)
export function isPiChain(
  chainMetadataResolver: Pick<ChainMetadataResolver, 'tryGetChainName'>,
  scrapedChains: DomainsEntry[],
  domainId: DomainId,
) {
  const chainName = chainMetadataResolver.tryGetChainName(domainId);
  // Note: .trim() because one chain name in the DB has a trailing \n char for some reason
  return !chainName || !scrapedChains.find((chain) => chain.name.trim() === chainName);
}

export function isEvmChain(
  chainMetadataResolver: Pick<ChainMetadataResolver, 'tryGetProtocol'>,
  domainId: DomainId,
) {
  const protocol = chainMetadataResolver.tryGetProtocol(domainId);
  return protocol === ProtocolType.Ethereum;
}
