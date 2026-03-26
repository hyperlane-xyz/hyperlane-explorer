import type { ChainMap, ChainMetadata } from '@hyperlane-xyz/sdk';
import { ProtocolType } from '@hyperlane-xyz/utils';

import { createChainMetadataResolver } from './metadataManager';

const metadata = {
  ethereum: {
    name: 'ethereum',
    domainId: 1,
    chainId: 1,
    protocol: ProtocolType.Ethereum,
    displayName: 'Ethereum',
    nativeToken: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: [{ http: 'https://ethereum.invalid' }],
  },
  cosmoshub: {
    name: 'cosmoshub',
    domainId: 2,
    chainId: 'cosmoshub-4',
    protocol: ProtocolType.Cosmos,
    displayName: 'Cosmos Hub',
    nativeToken: { name: 'Atom', symbol: 'ATOM', decimals: 6 },
    rpcUrls: [{ http: 'https://cosmos.invalid' }],
  },
} satisfies ChainMap<ChainMetadata>;

const collidingMetadata = {
  ethereum: {
    name: 'ethereum',
    domainId: 1,
    chainId: 11155111,
    protocol: ProtocolType.Ethereum,
    displayName: 'Ethereum',
    nativeToken: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: [{ http: 'https://ethereum.invalid' }],
  },
  aleotestnet: {
    name: 'aleotestnet',
    domainId: 12345,
    chainId: 1,
    protocol: ProtocolType.Aleo,
    displayName: 'Aleo Testnet',
    nativeToken: { name: 'Aleo', symbol: 'ALEO', decimals: 6 },
    rpcUrls: [{ http: 'https://aleo.invalid' }],
  },
} satisfies ChainMap<ChainMetadata>;

describe('createChainMetadataResolver', () => {
  it('resolves numeric chain IDs passed as strings', () => {
    const resolver = createChainMetadataResolver(metadata);

    expect(resolver.tryGetChainMetadata('ethereum')?.name).toBe('ethereum');
    expect(resolver.tryGetChainMetadata('1')?.name).toBe('ethereum');
    expect(resolver.tryGetChainMetadata(1)?.name).toBe('ethereum');
    expect(resolver.tryGetChainName('1')).toBe('ethereum');
    expect(resolver.tryGetChainName(1)).toBe('ethereum');
  });

  it('resolves non-numeric string chain IDs', () => {
    const resolver = createChainMetadataResolver(metadata);

    expect(resolver.tryGetChainMetadata('cosmoshub-4')?.name).toBe('cosmoshub');
  });

  it('treats numeric lookups as domain ids and numeric strings as chain ids', () => {
    const resolver = createChainMetadataResolver(collidingMetadata);

    expect(resolver.tryGetChainMetadata(1)?.name).toBe('ethereum');
    expect(resolver.tryGetChainName(1)).toBe('ethereum');
    expect(resolver.tryGetChainMetadata('1')?.name).toBe('aleotestnet');
    expect(resolver.tryGetChainName('1')).toBe('aleotestnet');
  });
});
