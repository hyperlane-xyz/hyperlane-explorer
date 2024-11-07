import { useEffect, useMemo } from 'react';
import { useQuery } from 'urql';

import { ChainMetadata, MultiProvider } from '@hyperlane-xyz/sdk';
import { objFilter } from '@hyperlane-xyz/utils';

import { unscrapedChainsInDb } from '../../../consts/config';
import { useStore } from '../../../store';
import { isPiChain } from '../utils';

import { DOMAINS_QUERY, DomainsEntry } from './fragments';

export function useScrapedDomains() {
  const { scrapedDomains, setScrapedDomains } = useStore((s) => ({
    scrapedDomains: s.scrapedDomains,
    setScrapedDomains: s.setScrapedDomains,
  }));

  const [result] = useQuery<{ domain: Array<DomainsEntry> }>({
    query: DOMAINS_QUERY,
    pause: !!scrapedDomains?.length,
  });
  const { data, fetching: isFetching, error } = result;

  useEffect(() => {
    if (!data) return;
    setScrapedDomains(data.domain);
  }, [data, error, setScrapedDomains]);

  return {
    scrapedDomains,
    isFetching,
    isError: !!error,
  };
}

export function useScrapedChains(multiProvider: MultiProvider) {
  const { scrapedDomains, isFetching, isError } = useScrapedDomains();
  const chainMetadata = useStore((s) => s.chainMetadata);

  const { chains } = useMemo(() => {
    const scrapedChains = objFilter(
      chainMetadata,
      (_, chainMetadata): chainMetadata is ChainMetadata =>
        !isPiChain(multiProvider, scrapedDomains, chainMetadata.domainId) &&
        !isUnscrapedDbChain(multiProvider, chainMetadata.domainId),
    );
    return { chains: scrapedChains };
  }, [multiProvider, chainMetadata, scrapedDomains]);

  return { chains, isFetching, isError };
}

// TODO: Remove once all chains in the DB are scraped
export function isUnscrapedDbChain(multiProvider: MultiProvider, domainId: DomainId) {
  const chainName = multiProvider.tryGetChainName(domainId);
  return chainName && unscrapedChainsInDb.includes(chainName);
}
