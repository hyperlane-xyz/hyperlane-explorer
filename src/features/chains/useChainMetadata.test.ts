import type { ChainMetadata } from '@hyperlane-xyz/sdk/metadata/chainMetadataTypes';
import type { ChainMap } from '@hyperlane-xyz/sdk/types';
import { ProtocolType } from '@hyperlane-xyz/utils';

import { mergeQueryParamChainMetadata } from './useChainMetadata';

function chain(name: string, domainId: number, rpcHost = name): ChainMetadata {
  return {
    name,
    protocol: ProtocolType.Ethereum,
    chainId: domainId,
    domainId,
    rpcUrls: [{ http: `https://${rpcHost}.example` }],
  };
}

describe('mergeQueryParamChainMetadata', () => {
  it('does not replace a saved chain with URL metadata', () => {
    const saved = { ethereum: chain('ethereum', 1, 'saved') };
    const linked = [chain('ethereum', 1, 'linked'), chain('newchain', 5000)];

    const merged = mergeQueryParamChainMetadata(linked, saved);

    expect(merged.ethereum.rpcUrls[0].http).toBe('https://saved.example');
    expect(merged.newchain).toEqual(linked[1]);
  });

  it('does not let a URL chain evict a saved custom chain by domainId', () => {
    const saved: ChainMap<Partial<ChainMetadata>> = {
      mychain: chain('mychain', 5000),
    };

    const merged = mergeQueryParamChainMetadata([chain('aaa', 5000)], saved);

    expect(merged.mychain).toEqual(saved.mychain);
    expect(merged.aaa).toBeUndefined();
  });
});
