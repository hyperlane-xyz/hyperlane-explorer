import { skipToken } from '@tanstack/react-query';

import { usdPriceQueryOptions } from './useNativeTokenUsdPrice';

jest.mock('../../../metadataStore', () => ({ useChainMetadataResolver: jest.fn() }));

describe('usdPriceQueryOptions', () => {
  interface Case {
    name: string;
    coinGeckoId: string | undefined;
    isTestnet: boolean;
    isSkipped: boolean;
  }
  const cases: Case[] = [
    {
      name: 'a mainnet asset with a coinGeckoId',
      coinGeckoId: 'usd-coin',
      isTestnet: false,
      isSkipped: false,
    },
    {
      name: 'an asset without a coinGeckoId',
      coinGeckoId: undefined,
      isTestnet: false,
      isSkipped: true,
    },
    { name: 'a testnet asset', coinGeckoId: 'usd-coin', isTestnet: true, isSkipped: true },
  ];
  for (const c of cases) {
    it(`${c.isSkipped ? 'skips' : 'runs'} the query for ${c.name}`, () => {
      const { queryFn } = usdPriceQueryOptions(c.coinGeckoId, c.isTestnet);
      expect(queryFn === skipToken).toBe(c.isSkipped);
    });
  }

  it('keys history by dispatch date and uses current price otherwise', () => {
    const dispatchMs = Date.UTC(2024, 0, 5, 12);
    expect(usdPriceQueryOptions('usd-coin', false, dispatchMs).queryKey).toEqual([
      'tokenUsdPrice',
      'usd-coin',
      '05-01-2024',
    ]);
    expect(usdPriceQueryOptions('usd-coin', false).queryKey).toEqual([
      'tokenUsdPrice',
      'usd-coin',
      'current',
    ]);
  });
});
