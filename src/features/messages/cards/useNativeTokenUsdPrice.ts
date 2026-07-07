import { useQuery } from '@tanstack/react-query';

import { useChainMetadataResolver } from '../../../metadataStore';

const COINGECKO_PRICE_API = 'https://api.coingecko.com/api/v3/simple/price';

// USD price of the origin chain's native (gas) token, looked up via the chain's
// gasCurrencyCoinGeckoId. Returns null when the chain has no CoinGecko id, is a
// testnet, or the price could not be fetched.
export function useNativeTokenUsdPrice(originDomainId: number): number | null {
  const chainMetadataResolver = useChainMetadataResolver();
  const originMetadata = chainMetadataResolver.tryGetChainMetadata(originDomainId);
  const coinGeckoId = originMetadata?.gasCurrencyCoinGeckoId;
  const isTestnet = !!originMetadata?.isTestnet;

  const { data } = useQuery({
    queryKey: ['nativeTokenUsdPrice', coinGeckoId],
    queryFn: () => fetchTokenUsdPrice(coinGeckoId!),
    enabled: !!coinGeckoId && !isTestnet,
    staleTime: 5 * 60 * 1000,
  });

  return data ?? null;
}

async function fetchTokenUsdPrice(coinGeckoId: string): Promise<number | null> {
  const url = `${COINGECKO_PRICE_API}?ids=${encodeURIComponent(coinGeckoId)}&vs_currencies=usd`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed to fetch token price: ${resp.status}`);
  const data = await resp.json();
  const price = data?.[coinGeckoId]?.usd;
  return typeof price === 'number' ? price : null;
}
