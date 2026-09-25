import type { IRegistry } from '@hyperlane-xyz/registry';
import { createChainMetadataResolver } from '@hyperlane-xyz/sdk/metadata/ChainMetadataResolver';
import type { ChainMetadata } from '@hyperlane-xyz/sdk/metadata/chainMetadataTypes';
import type { ChainMap } from '@hyperlane-xyz/sdk/types';
import { ProtocolType } from '@hyperlane-xyz/utils';

import { loadChainMetadata } from './loadChainMetadata';

function chain(name: string, domainId: number, chainId: number): ChainMetadata {
  return {
    name,
    protocol: ProtocolType.Ethereum,
    chainId,
    domainId,
    rpcUrls: [{ http: `https://rpc.${name}.example` }],
  };
}

const CANONICAL: ChainMap<ChainMetadata> = {
  ethereum: chain('ethereum', 1, 1),
  arbitrum: chain('arbitrum', 42161, 42161),
};

// loadChainMetadata only calls registry.getMetadata(); a minimal test double
// mirrors the existing metadataStore.test.ts pattern.
function fakeRegistry(metadata: ChainMap<ChainMetadata>): IRegistry {
  return { getMetadata: async () => metadata } as IRegistry;
}

describe('loadChainMetadata', () => {
  it('drops an override chain whose domainId collides with a canonical chain', async () => {
    // The DoS payload: a brand-new chain whose domainId (1) collides with Ethereum.
    const override: ChainMap<Partial<ChainMetadata>> = {
      zzz: chain('zzz', 1, 999999999),
    };

    const result = await loadChainMetadata(fakeRegistry(CANONICAL), override);

    // Colliding override is dropped; canonical chain is preserved.
    expect(result.zzz).toBeUndefined();
    expect(result.ethereum?.domainId).toBe(1);
    // The resolver must not throw on the sanitized map (the crash the report hit).
    expect(() => createChainMetadataResolver(result)).not.toThrow();
  });

  it('keeps a genuinely new override chain with a unique domainId', async () => {
    const override: ChainMap<Partial<ChainMetadata>> = {
      newchain: chain('newchain', 12345, 12345),
    };

    const result = await loadChainMetadata(fakeRegistry(CANONICAL), override);

    expect(result.newchain?.domainId).toBe(12345);
    expect(Object.keys(result).sort()).toEqual(['arbitrum', 'ethereum', 'newchain']);
    expect(() => createChainMetadataResolver(result)).not.toThrow();
  });

  it('merges an override for an existing chain without dropping it', async () => {
    const override: ChainMap<Partial<ChainMetadata>> = {
      ethereum: { rpcUrls: [{ http: 'https://custom.ethereum.example' }] },
    };

    const result = await loadChainMetadata(fakeRegistry(CANONICAL), override);

    expect(result.ethereum?.domainId).toBe(1);
    expect(result.ethereum?.rpcUrls?.[0]?.http).toBe('https://custom.ethereum.example');
  });
});
