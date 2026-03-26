import type { ChainMap, ChainMetadata, ChainNameOrId } from '@hyperlane-xyz/sdk';

export interface ChainMetadataResolver {
  metadata: ChainMap<ChainMetadata>;
  getKnownChainNames: () => string[];
  tryGetChainId: (chain: ChainNameOrId) => string | number | null;
  tryGetChainMetadata: (chain: ChainNameOrId) => ChainMetadata | null | undefined;
  tryGetChainName: (chain: ChainNameOrId) => string | null;
  tryGetDomainId: (chainName: string) => number | null;
  tryGetProtocol: (chain: ChainNameOrId) => ChainMetadata['protocol'] | null;
}

// Builds a lightweight lookup helper for one metadata snapshot so callers can resolve
// chain names, domain ids, and chain ids without constructing a MultiProtocolProvider.
export function createChainMetadataResolver(
  metadata: ChainMap<ChainMetadata>,
): ChainMetadataResolver {
  const byDomainId = new Map<number, ChainMetadata>();
  const byChainId = new Map<string | number, ChainMetadata>();

  Object.values(metadata).forEach((chainMetadata) => {
    byDomainId.set(chainMetadata.domainId, chainMetadata);
    if (chainMetadata.chainId !== undefined && chainMetadata.chainId !== null) {
      byChainId.set(chainMetadata.chainId, chainMetadata);

      const numericChainId = tryNormalizeNumericChainId(chainMetadata.chainId);
      if (numericChainId !== null) {
        byChainId.set(numericChainId, chainMetadata);
        byChainId.set(String(numericChainId), chainMetadata);
      }
    }
  });

  const tryGetChainMetadata = (chain: ChainNameOrId) => {
    if (typeof chain === 'string') return metadata[chain] || byChainId.get(chain);
    return byDomainId.get(chain) || byChainId.get(chain);
  };

  return {
    metadata,
    getKnownChainNames: () => Object.keys(metadata),
    tryGetChainId: (chain) => tryGetChainMetadata(chain)?.chainId ?? null,
    tryGetChainMetadata,
    tryGetChainName: (chain) => tryGetChainMetadata(chain)?.name ?? null,
    tryGetDomainId: (chainName) => metadata[chainName]?.domainId ?? null,
    tryGetProtocol: (chain) => tryGetChainMetadata(chain)?.protocol ?? null,
  };
}

function tryNormalizeNumericChainId(chainId: string | number) {
  if (typeof chainId === 'number') {
    return Number.isSafeInteger(chainId) ? chainId : null;
  }

  if (!/^\d+$/.test(chainId)) return null;

  const numericChainId = Number(chainId);
  if (!Number.isSafeInteger(numericChainId)) return null;
  if (String(numericChainId) !== chainId) return null;

  return numericChainId;
}
