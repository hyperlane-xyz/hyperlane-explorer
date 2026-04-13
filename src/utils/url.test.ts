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

  it('returns null instead of throwing for malformed explorer metadata', async () => {
    const resolver = createResolver(malformedExplorerMetadata);

    expect(getBlockExplorerTxUrl(resolver, 'broken', '0x123')).toBeNull();
    expect(getBlockExplorerAddressUrl(resolver, 'broken', '0xabc')).toBeNull();
    await expect(tryGetBlockExplorerAddressUrl(resolver, 'broken', '0xabc')).resolves.toBeNull();
  });
});
