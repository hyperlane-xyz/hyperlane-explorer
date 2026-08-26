import type { ChainMetadataResolver } from '@hyperlane-xyz/sdk/metadata/ChainMetadataResolver';
import type { ChainMetadata } from '@hyperlane-xyz/sdk/metadata/chainMetadataTypes';
import { objFilter } from '@hyperlane-xyz/utils';
import { useEffect, useMemo } from 'react';
import { useQuery } from 'urql';

import { unscrapedChainsInDb } from '../../../consts/config';
import { useStore } from '../../../metadataStore';
import { isPiChain } from '../utils';
import { type DomainsEntry, DOMAINS_QUERY } from './fragments';

export function useScrapedDomains() {
  const scrapedDomains = useStore((s) => s.scrapedDomains);
  const setScrapedDomains = useStore((s) => s.setScrapedDomains);

  const [result] = useQuery<{ domain: Array<DomainsEntry> }>({
    query: DOMAINS_QUERY,
    pause: !!scrapedDomains?.length,
  });
  const { data, fetching: isFetching, error } = result;
  const resolvedScrapedDomains = scrapedDomains.length ? scrapedDomains : (data?.domain ?? []);

  useEffect(() => {
    if (!data) return;
    setScrapedDomains(data.domain);
  }, [data, error, setScrapedDomains]);

  return {
    scrapedDomains: resolvedScrapedDomains,
    isFetching,
    isError: !!error,
    hasRun: !!data || !!error || resolvedScrapedDomains.length > 0,
  };
}

export function useScrapedChains(chainMetadataResolver: ChainMetadataResolver) {
  const { scrapedDomains, isFetching, isError, hasRun } = useScrapedDomains();
  const chainMetadata = useStore((s) => s.chainMetadata);
  const isChainMetadataLoaded = useStore((s) => s.isChainMetadataLoaded);
  const chainMetadataError = useStore((s) => s.chainMetadataError);

  const { chains } = useMemo(() => {
    const scrapedChains = objFilter(
      chainMetadata,
      (_, chainMetadata): chainMetadata is ChainMetadata =>
        !isPiChain(chainMetadataResolver, scrapedDomains, chainMetadata.domainId) &&
        !isUnscrapedDbChain(chainMetadataResolver, chainMetadata.domainId),
    );
    return { chains: scrapedChains };
  }, [chainMetadataResolver, chainMetadata, scrapedDomains]);

  return {
    chains,
    scrapedDomains,
    isFetching,
    isError: isError || !!chainMetadataError,
    hasRun: hasRun && isChainMetadataLoaded,
  };
}

// TODO: Remove once all chains in the DB are scraped
export function isUnscrapedDbChain(
  chainMetadataResolver: Pick<ChainMetadataResolver, 'tryGetChainName'>,
  domainId: DomainId,
) {
  const chainName = chainMetadataResolver.tryGetChainName(domainId);
  return chainName && unscrapedChainsInDb.includes(chainName);
}
