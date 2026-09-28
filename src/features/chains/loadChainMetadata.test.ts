import type { IRegistry } from '@hyperlane-xyz/registry';
import { createChainMetadataResolver } from '@hyperlane-xyz/sdk/metadata/ChainMetadataResolver';
import type { ChainMetadata } from '@hyperlane-xyz/sdk/metadata/chainMetadataTypes';
import type { ChainMap } from '@hyperlane-xyz/sdk/types';
import { ProtocolType } from '@hyperlane-xyz/utils';

import { logger } from '../../utils/logger';
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

    const { metadata, overrides } = await loadChainMetadata(fakeRegistry(CANONICAL), override);

    // Colliding override is dropped; canonical chain is preserved.
    expect(metadata.zzz).toBeUndefined();
    expect(metadata.ethereum?.domainId).toBe(1);
    expect(overrides.zzz).toBeUndefined();
    // The resolver must not throw on the sanitized map (the crash the report hit).
    expect(() => createChainMetadataResolver(metadata)).not.toThrow();
  });

  it('keeps a genuinely new override chain with a unique domainId', async () => {
    const override: ChainMap<Partial<ChainMetadata>> = {
      newchain: chain('newchain', 12345, 12345),
    };

    const { metadata, overrides } = await loadChainMetadata(fakeRegistry(CANONICAL), override);

    expect(metadata.newchain?.domainId).toBe(12345);
    expect(overrides.newchain?.domainId).toBe(12345);
    expect(Object.keys(metadata).sort()).toEqual(['arbitrum', 'ethereum', 'newchain']);
    expect(() => createChainMetadataResolver(metadata)).not.toThrow();
  });

  it('merges an override for an existing chain without dropping it', async () => {
    const override: ChainMap<Partial<ChainMetadata>> = {
      ethereum: { rpcUrls: [{ http: 'https://custom.ethereum.example' }] },
    };

    const { metadata, overrides } = await loadChainMetadata(fakeRegistry(CANONICAL), override);

    expect(metadata.ethereum?.domainId).toBe(1);
    expect(metadata.ethereum?.rpcUrls?.[0]?.http).toBe('https://custom.ethereum.example');
    expect(overrides.ethereum?.domainId).toBe(1);
  });

  it('preserves canonical owner when a canonical override steals its domainId', async () => {
    const override: ChainMap<Partial<ChainMetadata>> = {
      ethereum: { domainId: 42161 },
    };

    const { metadata, overrides } = await loadChainMetadata(fakeRegistry(CANONICAL), override);

    expect(metadata.ethereum?.domainId).toBe(1);
    expect(metadata.arbitrum?.domainId).toBe(42161);
    expect(overrides.ethereum?.domainId).toBe(1);
  });

  it('does not let an override vacate and steal a canonical domainId', async () => {
    const override: ChainMap<Partial<ChainMetadata>> = {
      ethereum: { domainId: 999 },
      evil: chain('evil', 1, 999),
    };

    const { metadata, overrides } = await loadChainMetadata(fakeRegistry(CANONICAL), override);

    expect(metadata.ethereum?.domainId).toBe(1);
    expect(metadata.evil).toBeUndefined();
    expect(overrides.ethereum?.domainId).toBe(1);
    expect(overrides.evil).toBeUndefined();
  });

  it('fails loudly when canonical registry chains share a domainId', async () => {
    const invalidCanonical = {
      ...CANONICAL,
      arbitrum: chain('arbitrum', 1, 42161),
    };

    await expect(loadChainMetadata(fakeRegistry(invalidCanonical), {})).rejects.toThrow(
      'Duplicate canonical domainId 1',
    );
  });

  it('logs when an invalid stored override is removed', async () => {
    const error = jest.spyOn(logger, 'error').mockImplementation();

    const { overrides } = await loadChainMetadata(fakeRegistry(CANONICAL), {
      removedchain: { domainId: 5000 },
    });

    expect(overrides.removedchain).toBeUndefined();
    expect(error).toHaveBeenCalledWith(
      'Failed to parse metadata for removedchain, removing its invalid stored override and skipping',
    );
    error.mockRestore();
  });
});
