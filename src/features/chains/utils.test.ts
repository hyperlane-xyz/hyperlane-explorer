import type { ChainNameOrId } from '@hyperlane-xyz/sdk';
import { ProtocolType } from '@hyperlane-xyz/utils';

import type { DomainsEntry } from './queries/fragments';
import { isPiSearchChain } from './utils';

const chains: Record<number, { name: string; protocol: ProtocolType }> = {
  1: { name: 'ethereum', protocol: ProtocolType.Ethereum },
  2: { name: 'unscraped', protocol: ProtocolType.Ethereum },
  3: { name: 'solana', protocol: ProtocolType.Sealevel },
};
const resolver = {
  tryGetChainName: (domainId: ChainNameOrId) => chains[Number(domainId)]?.name ?? null,
  tryGetProtocol: (domainId: ChainNameOrId) => chains[Number(domainId)]?.protocol ?? null,
};
const scrapedChains = [{ name: 'ethereum' }, { name: 'solana' }] as DomainsEntry[];

describe('isPiSearchChain', () => {
  it.each([
    [1, false, false],
    [2, false, true],
    [3, false, false],
    [1, true, true],
    [2, true, true],
    [3, true, false],
  ])('domain %s with includeScrapedChains=%s -> %s', (domainId, includeScrapedChains, expected) => {
    expect(isPiSearchChain(resolver, scrapedChains, domainId, includeScrapedChains)).toBe(expected);
  });
});
