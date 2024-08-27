import { useEffect } from 'react';
import { useQuery } from 'urql';

import { useStore } from '../../../store';

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
