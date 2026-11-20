import { create } from 'zustand';

import type { DomainsEntry } from './fragments';

export const useScrapedDomainsStore = create<{
  scrapedDomains: DomainsEntry[];
  setScrapedDomains: (domains: DomainsEntry[]) => void;
}>((set) => ({
  scrapedDomains: [],
  setScrapedDomains: (scrapedDomains) => set({ scrapedDomains }),
}));
