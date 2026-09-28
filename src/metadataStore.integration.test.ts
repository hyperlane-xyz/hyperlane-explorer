/** @jest-environment jsdom */

import { TextDecoder, TextEncoder } from 'util';

import type { IRegistry } from '@hyperlane-xyz/registry';
import type { ChainMetadata } from '@hyperlane-xyz/sdk/metadata/chainMetadataTypes';
import type { ChainMap } from '@hyperlane-xyz/sdk/types';

Object.assign(globalThis, {
  fetch: jest.fn().mockResolvedValue({ ok: true, text: async () => '{}' }),
  TextDecoder,
  TextEncoder,
});

let useStore: typeof import('./metadataStore').useStore;

beforeAll(async () => {
  // Load SDK consumers after jsdom receives the globals they require.
  ({ useStore } = await import('./metadataStore'));
});

function chain(name: string, domainId: number): ChainMetadata {
  return {
    name,
    protocol: 'ethereum' as ChainMetadata['protocol'],
    chainId: domainId,
    domainId,
    rpcUrls: [{ http: `https://rpc.${name}.example` }],
  };
}

function fakeRegistry(metadata: ChainMap<ChainMetadata>): IRegistry {
  return { getMetadata: async () => metadata } as IRegistry;
}

describe('metadata store persistence', () => {
  it('rewrites poisoned persisted overrides with sanitized values', async () => {
    useStore.getState().setRegistry(
      fakeRegistry({
        ethereum: chain('ethereum', 1),
        arbitrum: chain('arbitrum', 42161),
      }),
    );
    localStorage.setItem(
      'hyperlane',
      JSON.stringify({
        state: {
          chainMetadataOverrides: {
            ethereum: { domainId: 42161 },
            evil: chain('evil', 1),
            custom: chain('custom', 5000),
            alpha: chain('alpha', 6000),
            zeta: chain('zeta', 6000),
          },
        },
        version: 2,
      }),
    );

    await useStore.persist.rehydrate();
    await useStore.getState().ensureChainMetadata();

    const persisted = JSON.parse(localStorage.getItem('hyperlane') ?? '{}');
    expect(persisted.state.chainMetadataOverrides).toEqual({
      ethereum: { domainId: 1 },
      custom: chain('custom', 5000),
      alpha: chain('alpha', 6000),
    });
  });
});
