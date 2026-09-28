import type { ChainMetadata } from '@hyperlane-xyz/sdk/metadata/chainMetadataTypes';
import type { ChainMap } from '@hyperlane-xyz/sdk/types';
import { ProtocolType, toBase64 } from '@hyperlane-xyz/utils';

import { useStore } from '../../metadataStore';
import { useQueryParam } from '../../utils/queryParams';
import { mergeQueryParamChainMetadata, useQueryParamChainConfigSync } from './useChainMetadata';

const mockProcessedQueryVal = { current: null as string | null };

jest.mock('react', () => ({
  ...jest.requireActual('react'),
  useEffect: (effect: () => void) => effect(),
  useRef: () => mockProcessedQueryVal,
}));

jest.mock('../../metadataStore', () => ({ useStore: jest.fn() }));
jest.mock('../../utils/queryParams', () => ({ useQueryParam: jest.fn() }));

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

describe('useQueryParamChainConfigSync', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockProcessedQueryVal.current = null;
  });

  it('does not re-add a rejected URL override after sanitization removes it', () => {
    const setChainMetadataOverrides = jest.fn().mockResolvedValue(undefined);
    mockHookState({}, setChainMetadataOverrides, [chain('evil', 1)]);

    useQueryParamChainConfigSync();
    useQueryParamChainConfigSync();

    expect(setChainMetadataOverrides).toHaveBeenCalledTimes(1);
  });

  it('does not replace saved metadata when the same URL is processed after a reload', () => {
    const setChainMetadataOverrides = jest.fn().mockResolvedValue(undefined);
    const saved = { ethereum: chain('ethereum', 1, 'saved') };
    mockHookState(saved, setChainMetadataOverrides, [chain('ethereum', 1, 'linked')]);

    useQueryParamChainConfigSync();
    // A remount starts with a new ref but the persisted override still wins.
    mockProcessedQueryVal.current = null;
    useQueryParamChainConfigSync();

    expect(setChainMetadataOverrides).not.toHaveBeenCalled();
  });
});

function mockHookState(
  overrides: ChainMap<Partial<ChainMetadata>>,
  setChainMetadataOverrides: jest.Mock,
  linkedChains: ChainMetadata[],
) {
  (useStore as unknown as jest.Mock).mockImplementation(
    (selector: (state: Record<string, unknown>) => unknown) =>
      selector({ chainMetadataOverrides: overrides, setChainMetadataOverrides }),
  );
  jest.mocked(useQueryParam).mockReturnValue(toBase64(linkedChains) ?? '');
}
