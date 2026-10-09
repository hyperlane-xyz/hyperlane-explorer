import { QueryClient, QueryObserver, skipToken } from '@tanstack/react-query';

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
      false,
      '05-01-2024',
    ]);
    expect(usdPriceQueryOptions('usd-coin', false).queryKey).toEqual([
      'tokenUsdPrice',
      'usd-coin',
      false,
      'current',
    ]);
  });

  it('does not serve the price cached for a mainnet asset to a testnet asset', () => {
    const queryClient = new QueryClient();
    const dispatchMs = Date.UTC(2024, 0, 5, 12);
    const mainnet = usdPriceQueryOptions('ethereum', false, dispatchMs);
    const testnet = usdPriceQueryOptions('ethereum', true, dispatchMs);
    queryClient.setQueryData(mainnet.queryKey, 3500);

    expect(testnet.queryKey).not.toEqual(mainnet.queryKey);
    expect(testnet.queryFn === skipToken).toBe(true);
    expect(queryClient.getQueryData(testnet.queryKey)).toBeUndefined();
    expect(new QueryObserver(queryClient, testnet).getCurrentResult().data).toBeUndefined();
    expect(new QueryObserver(queryClient, mainnet).getCurrentResult().data).toBe(3500);
  });
});
