import type { ChainMetadata } from '@hyperlane-xyz/sdk/metadata/chainMetadataTypes';
import type { ChainMap } from '@hyperlane-xyz/sdk/types';
import { ProtocolType, toBase64 } from '@hyperlane-xyz/utils';

import { useStore } from '../../metadataStore';
import { useQueryParam } from '../../utils/queryParams';
import { filterQueryParamChainMetadata, useQueryParamChainConfigSync } from './useChainMetadata';

const mockProcessedQueryVal: { current: string | null } = { current: null };

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

describe('filterQueryParamChainMetadata', () => {
  it('does not replace a saved chain with URL metadata', () => {
    const saved = { ethereum: chain('ethereum', 1, 'saved') };
    const linked = [chain('ethereum', 1, 'linked'), chain('newchain', 5000)];

    const accepted = filterQueryParamChainMetadata(linked, saved, {});

    expect(accepted.ethereum).toBeUndefined();
    expect(accepted.newchain).toEqual(linked[1]);
  });

  it('does not let a URL chain evict a saved custom chain by domainId', () => {
    const saved: ChainMap<Partial<ChainMetadata>> = {
      mychain: chain('mychain', 5000),
    };

    const accepted = filterQueryParamChainMetadata([chain('aaa', 5000)], saved, {});

    expect(accepted).toEqual({});
  });

  it('rejects a URL chain using a registry domainId', () => {
    const accepted = filterQueryParamChainMetadata(
      [chain('evil', 1)],
      {},
      { ethereum: chain('ethereum', 1) },
    );

    expect(accepted).toEqual({});
  });

  it('rejects a duplicate domainId within the URL', () => {
    const accepted = filterQueryParamChainMetadata(
      [chain('first', 5000), chain('second', 5000)],
      {},
      {},
    );

    expect(accepted.first).toBeDefined();
    expect(accepted.second).toBeUndefined();
  });
});

describe('useQueryParamChainConfigSync', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockProcessedQueryVal.current = null;
  });

  it('processes a URL only once while the store update settles', () => {
    const setChainMetadataOverrides = jest.fn().mockResolvedValue(undefined);
    mockHookState({}, setChainMetadataOverrides, [chain('newchain', 5000)], {});

    useQueryParamChainConfigSync();
    useQueryParamChainConfigSync();

    expect(setChainMetadataOverrides).toHaveBeenCalledTimes(1);
  });

  it('does not write when every URL chain is rejected', () => {
    const setChainMetadataOverrides = jest.fn().mockResolvedValue(undefined);
    mockHookState({}, setChainMetadataOverrides, [chain('evil', 1)], {
      ethereum: chain('ethereum', 1),
    });

    useQueryParamChainConfigSync();
    useQueryParamChainConfigSync();

    expect(setChainMetadataOverrides).not.toHaveBeenCalled();
  });

  it('does not replace saved metadata when the same URL is processed after a reload', () => {
    const setChainMetadataOverrides = jest.fn().mockResolvedValue(undefined);
    const saved = { ethereum: chain('ethereum', 1, 'saved') };
    mockHookState(saved, setChainMetadataOverrides, [chain('ethereum', 1, 'linked')], {
      ethereum: chain('ethereum', 1, 'registry'),
    });

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
  knownChainMetadata: ChainMap<ChainMetadata>,
) {
  const mockedUseStore = jest.mocked(useStore);
  for (let render = 0; render < 2; render += 1) {
    mockedUseStore.mockReturnValueOnce(overrides);
    mockedUseStore.mockReturnValueOnce(setChainMetadataOverrides);
    mockedUseStore.mockReturnValueOnce(knownChainMetadata);
    mockedUseStore.mockReturnValueOnce(true);
  }
  jest.mocked(useQueryParam).mockReturnValue(toBase64(linkedChains) ?? '');
}
