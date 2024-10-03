import { useEffect, useMemo } from 'react';
import { useQuery } from 'urql';

import { ChainMetadata, MultiProvider } from '@hyperlane-xyz/sdk';
import { objFilter } from '@hyperlane-xyz/utils';

import { unscrapedChainsInDb } from '../../../consts/config';
import { useStore } from '../../../store';
import { isEvmChain, isPiChain } from '../utils';

import { DOMAINS_QUERY, DomainsEntry } from './fragments';

export function useScrapedChains() {
  const { scrapedChains, setScrapedChains } = useStore((s) => ({
    scrapedChains: s.scrapedChains,
    setScrapedChains: s.setScrapedChains,
  }));

  const [result] = useQuery<{ domain: Array<DomainsEntry> }>({
    query: DOMAINS_QUERY,
    pause: !!scrapedChains?.length,
  });
  const { data, fetching: isFetching, error } = result;

  useEffect(() => {
    if (!data) return;
    setScrapedChains(data.domain);
  }, [data, error, setScrapedChains]);

  return {
    scrapedChains,
    isFetching,
    isError: !!error,
  };
}

export function useScrapedEvmChains(multiProvider: MultiProvider) {
  const { scrapedChains, isFetching, isError } = useScrapedChains();

  const { chains } = useMemo(() => {
    // Filtering to EVM is necessary to prevent errors until cosmos support is added
    // https://github.com/hyperlane-xyz/hyperlane-explorer/issues/61
    const scrapedEvmChains = objFilter(
      multiProvider.metadata,
      (_, chainMetadata): chainMetadata is ChainMetadata =>
        isEvmChain(multiProvider, chainMetadata.chainId) &&
        !isPiChain(multiProvider, scrapedChains, chainMetadata.chainId) &&
        !isUnscrapedDbChain(multiProvider, chainMetadata.chainId),
    );
    // Return only evmChains because of graphql only accept query non-evm chains (with bigint type not string)
    return { chains: scrapedEvmChains };
  }, [multiProvider, scrapedChains]);

  return { chains, isFetching, isError };
}

// TODO: Remove once all chains in the DB are scraped
export function isUnscrapedDbChain(multiProvider: MultiProvider, chainIdOrName: number | string) {
  const chainName = multiProvider.tryGetChainName(chainIdOrName);
  return chainName && unscrapedChainsInDb.includes(chainName);
}
