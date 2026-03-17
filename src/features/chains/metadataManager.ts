import type { ChainMap, ChainMetadata, ChainNameOrId } from '@hyperlane-xyz/sdk';

export interface ChainMetadataResolver {
  metadata: ChainMap<ChainMetadata>;
  getKnownChainNames: () => string[];
  tryGetChainId: (chain: ChainNameOrId) => string | number | null;
  tryGetChainMetadata: (chain: ChainNameOrId) => ChainMetadata | null | undefined;
  tryGetChainName: (domainId: DomainId) => string | null | undefined;
  tryGetDomainId: (chainName: string) => number | null;
  tryGetProtocol: (chain: ChainNameOrId) => ChainMetadata['protocol'] | null | undefined;
}

export function createChainMetadataResolver(
  metadata: ChainMap<ChainMetadata>,
): ChainMetadataResolver {
  const byDomainId = new Map<number, ChainMetadata>();
  const byChainId = new Map<number, ChainMetadata>();

  Object.values(metadata).forEach((chainMetadata) => {
    byDomainId.set(chainMetadata.domainId, chainMetadata);
    if (chainMetadata.chainId !== undefined && chainMetadata.chainId !== null) {
      byChainId.set(Number(chainMetadata.chainId), chainMetadata);
    }
  });

  const tryGetChainMetadata = (chain: ChainNameOrId) => {
    if (typeof chain === 'string') return metadata[chain];
    return byDomainId.get(chain) || byChainId.get(chain);
  };

  return {
    metadata,
    getKnownChainNames: () => Object.keys(metadata),
    tryGetChainId: (chain) => tryGetChainMetadata(chain)?.chainId ?? null,
    tryGetChainMetadata,
    tryGetChainName: (domainId) => byDomainId.get(domainId)?.name,
    tryGetDomainId: (chainName) => metadata[chainName]?.domainId ?? null,
    tryGetProtocol: (chain) => tryGetChainMetadata(chain)?.protocol,
  };
}
