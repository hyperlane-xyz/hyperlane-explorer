import type { ChainMetadata } from '@hyperlane-xyz/sdk';
import { ProtocolType } from '@hyperlane-xyz/utils';

import {
  getBlockExplorerAddressUrl,
  getBlockExplorerTxUrl,
  tryGetBlockExplorerAddressUrl,
} from './url';

const explorerFamily = 'etherscan' as NonNullable<
  NonNullable<ChainMetadata['blockExplorers']>[number]['family']
>;

const validMetadata: ChainMetadata = {
  name: 'ethereum',
  domainId: 1,
  chainId: 1,
  protocol: ProtocolType.Ethereum,
  displayName: 'Ethereum',
  nativeToken: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: [{ http: 'https://ethereum.invalid' }],
  blockExplorers: [
    {
      name: 'Etherscan',
      url: 'https://etherscan.io',
      apiUrl: 'https://api.etherscan.io',
      family: explorerFamily,
    },
  ],
};

const tronMetadata: ChainMetadata = {
  ...validMetadata,
  name: 'tron',
  protocol: ProtocolType.Tron,
  blockExplorers: [
    {
      name: 'Tronscan',
      url: 'https://tronscan.org/#',
      apiUrl: 'https://tronscan.org/#',
      family: 'tronscan' as NonNullable<
        NonNullable<ChainMetadata['blockExplorers']>[number]['family']
      >,
    },
  ],
};

const malformedExplorerMetadata: ChainMetadata = {
  ...validMetadata,
  name: 'broken',
  blockExplorers: [
    {
      name: 'Broken',
      url: '://broken url',
      apiUrl: 'https://api.invalid',
      family: explorerFamily,
    },
  ],
};

function createResolver(metadata: ChainMetadata) {
  return {
    tryGetChainMetadata: jest.fn().mockReturnValue(metadata),
  };
}

describe('url utils', () => {
  let debugSpy: jest.SpyInstance;

  beforeEach(() => {
    debugSpy = jest.spyOn(console, 'debug').mockImplementation(() => {});
  });

  afterEach(() => {
    debugSpy.mockRestore();
  });

  it('returns explorer urls for valid metadata', async () => {
    const resolver = createResolver(validMetadata);

    expect(getBlockExplorerTxUrl(resolver, 'ethereum', '0x123')).toBe(
      'https://etherscan.io/tx/0x123',
    );
    expect(getBlockExplorerAddressUrl(resolver, 'ethereum', '0xabc')).toBe(
      'https://etherscan.io/address/0xabc',
    );
    await expect(tryGetBlockExplorerAddressUrl(resolver, 'ethereum', '0xabc')).resolves.toBe(
      'https://etherscan.io/address/0xabc',
    );
  });

  it('routes Tronscan urls inside the SPA hash fragment', () => {
    const resolver = createResolver(tronMetadata);

    expect(getBlockExplorerTxUrl(resolver, 'tron', 'abc123')).toBe(
      'https://tronscan.org/#/transaction/abc123',
    );
    expect(getBlockExplorerAddressUrl(resolver, 'tron', 'TLckRZh8CmnVe9Nqe77ESz87Pp6tXWv5Hi')).toBe(
      'https://tronscan.org/#/address/TLckRZh8CmnVe9Nqe77ESz87Pp6tXWv5Hi',
    );
    // Hex-form Tron registry addresses (e.g. warp route addressOrDenom) are
    // converted to base58 so Tronscan can resolve them.
    expect(
      getBlockExplorerAddressUrl(resolver, 'tron', '0xbf8078818627110fD05827Ca0aa9E4518d3421ec'),
    ).toMatch(/^https:\/\/tronscan\.org\/#\/address\/T[1-9A-HJ-NP-Za-km-z]{33}$/);
  });

  it('returns null instead of throwing for malformed explorer metadata', async () => {
    const resolver = createResolver(malformedExplorerMetadata);

    expect(getBlockExplorerTxUrl(resolver, 'broken', '0x123')).toBeNull();
    expect(getBlockExplorerAddressUrl(resolver, 'broken', '0xabc')).toBeNull();
    await expect(tryGetBlockExplorerAddressUrl(resolver, 'broken', '0xabc')).resolves.toBeNull();
  });
});
