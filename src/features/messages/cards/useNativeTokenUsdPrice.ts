import { queryOptions, skipToken, useQueries, useQuery } from '@tanstack/react-query';

import { useChainMetadataResolver } from '../../../metadataStore';

const COINGECKO_SIMPLE_PRICE_API = 'https://api.coingecko.com/api/v3/simple/price';
const COINGECKO_COIN_API = 'https://api.coingecko.com/api/v3/coins';

// USD price of the origin chain's native (gas) token at the time the message was
// dispatched, looked up via the chain's gasCurrencyCoinGeckoId. Uses CoinGecko's
// end-of-day historical price for the dispatch date; falls back to the current
// spot price when the message has no dispatch timestamp or was dispatched today
// (historical EOD data is not yet available). Returns null when the chain has no
// CoinGecko id, is a testnet, or the price could not be fetched (e.g. dispatch
// date is outside CoinGecko's free-tier history window).
export function useNativeTokenUsdPrice(
  originDomainId: number,
  dispatchTimestampMs?: number,
): number | null {
  const chainMetadataResolver = useChainMetadataResolver();
  const originMetadata = chainMetadataResolver.tryGetChainMetadata(originDomainId);

  const { data } = useQuery(
    usdPriceQueryOptions(
      originMetadata?.gasCurrencyCoinGeckoId,
      !!originMetadata?.isTestnet,
      dispatchTimestampMs,
    ),
  );

  return data ?? null;
}

// Same price lookup for arbitrary CoinGecko ids (e.g. ERC20 tokens), keyed by id.
export function useTokenUsdPrices(
  coinGeckoIds: string[],
  isTestnet: boolean,
  dispatchTimestampMs?: number,
): Record<string, number | null> {
  const results = useQueries({
    queries: coinGeckoIds.map((id) => usdPriceQueryOptions(id, isTestnet, dispatchTimestampMs)),
  });

  return Object.fromEntries(coinGeckoIds.map((id, i) => [id, results[i].data ?? null]));
}

// The query is skipped (no data) when there is no CoinGecko id or the chain is a testnet.
export function usdPriceQueryOptions(
  coinGeckoId: string | undefined,
  isTestnet: boolean,
  dispatchTimestampMs?: number,
) {
  // dd-mm-yyyy (UTC) for the dispatch date, or undefined to use the current spot
  // price (no timestamp, or dispatched today so EOD data isn't available yet).
  const historyDate = getHistoryDate(dispatchTimestampMs);

  return queryOptions({
    queryKey: ['tokenUsdPrice', coinGeckoId, historyDate ?? 'current'],
    queryFn:
      coinGeckoId && !isTestnet
        ? () =>
            historyDate
              ? fetchHistoricalUsdPrice(coinGeckoId, historyDate)
              : fetchCurrentUsdPrice(coinGeckoId)
        : skipToken,
    // Historical prices are immutable; the current spot price can go stale.
    staleTime: historyDate ? Infinity : 5 * 60 * 1000,
  });
}

function getHistoryDate(dispatchTimestampMs?: number): string | undefined {
  if (!dispatchTimestampMs) return undefined;
  const dispatch = new Date(dispatchTimestampMs);
  if (Number.isNaN(dispatch.getTime())) return undefined;

  const today = new Date();
  const isToday =
    dispatch.getUTCFullYear() === today.getUTCFullYear() &&
    dispatch.getUTCMonth() === today.getUTCMonth() &&
    dispatch.getUTCDate() === today.getUTCDate();
  if (isToday) return undefined;

  const dd = String(dispatch.getUTCDate()).padStart(2, '0');
  const mm = String(dispatch.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = dispatch.getUTCFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

async function fetchHistoricalUsdPrice(coinGeckoId: string, date: string): Promise<number | null> {
  const url = `${COINGECKO_COIN_API}/${encodeURIComponent(
    coinGeckoId,
  )}/history?date=${date}&localization=false`;
  const data = await getJson(url);
  const price = data?.market_data?.current_price?.usd;
  return typeof price === 'number' ? price : null;
}

async function fetchCurrentUsdPrice(coinGeckoId: string): Promise<number | null> {
  const url = `${COINGECKO_SIMPLE_PRICE_API}?ids=${encodeURIComponent(
    coinGeckoId,
  )}&vs_currencies=usd`;
  const data = await getJson(url);
  const price = data?.[coinGeckoId]?.usd;
  return typeof price === 'number' ? price : null;
}

async function getJson(url: string): Promise<any> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed to fetch token price: ${resp.status}`);
  return resp.json();
}
