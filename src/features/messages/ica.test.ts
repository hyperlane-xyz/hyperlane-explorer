import { chainAddresses } from '@hyperlane-xyz/registry';
import { ProtocolType, addressToBytes32 } from '@hyperlane-xyz/utils';
import { QueryClient, useQueries, useQuery } from '@tanstack/react-query';
import { providers, utils } from 'ethers';

import { MessageStatus, type MessageStub } from '../../types';
import {
  decodeIcaBody,
  fetchIcaRouters,
  getIcaAccountConfig,
  icaRoutersQueryOptions,
  IcaMessageType,
  isIcaMessage,
  useCcipReadIsmUrls,
  useIcaAddress,
  useIsIcaMessage,
  useRelatedIcaMessage,
} from './ica';
import { parseMessageStubResult } from './queries/parse';

const mockProvider = new providers.JsonRpcProvider();
const mockRegistry = {
  getUri: () => 'https://github.com/hyperlane-xyz/hyperlane-registry',
  getChainAddresses: jest.fn(),
};
let mockProviderVersion = 1;
let mockProviderReady = true;

jest.mock('../../metadataStore', () => ({
  useChainMetadataResolver: () => ({
    tryGetChainName: (domain: number) => (domain === 8453 ? 'base' : 'arbitrum'),
    tryGetProtocol: () => ProtocolType.Ethereum,
  }),
}));
jest.mock('../../store', () => ({
  useRegistry: () => mockRegistry,
  useMultiProviderVersion: () => mockProviderVersion,
  useReadyMultiProvider: () =>
    mockProviderReady
      ? {
          getEthersV5Provider: () => mockProvider,
          getDomainId: () => 8453,
        }
      : undefined,
}));
jest.mock('@tanstack/react-query', () => ({
  ...jest.requireActual('@tanstack/react-query'),
  useQuery: jest.fn(() => ({ data: undefined, isFetching: false, isError: false })),
  useQueries: jest.fn(),
}));
jest.mock('../chains/queries/useScrapedChains', () => ({
  useScrapedDomains: () => ({ scrapedDomains: [{ name: 'base' }] }),
}));
jest.mock('./pi-queries/fetchPiChainMessages', () => ({}));
jest.mock('./queries/build', () => ({
  MessageIdentifierType: { OriginTxHash: 1 },
  buildMessageQuery: () => ({ query: '', variables: {} }),
}));
jest.mock('./queries/parse', () => ({ parseMessageStubResult: jest.fn() }));
jest.mock('urql', () => ({ useQuery: () => [{ data: undefined, fetching: false }] }));
jest.mock('react', () => ({
  ...jest.requireActual('react'),
  useMemo: (compute: () => unknown) => compute(),
}));

const v2 = {
  base: '0x44647Cd983E80558793780f9a0c7C2aa9F384D07',
  arbitrum: '0xF90A3d406C6F8321fe118861A357F4D7107760D7',
};
const v3 = {
  base: '0x0ca10c09cad7afe01619a4a9acdf6481938258c4',
  arbitrum: '0xa0f62e4a4597471aa6fac829aca3c468ea751c3c',
};
const owner = '0x0fef9e88a7b76bcdbf451780c6774fe32965ee98';
const ica = '0x2254720417e8645d069821772790612149bf2c08';
const userSalt = addressToBytes32('0xc0a6164860976f1859c519c03b31b9631919c04b');
const commitment = '0x' + '11'.repeat(32);
const zero = '0x' + '00'.repeat(20);

function lastQuery() {
  const calls = jest.mocked(useQuery).mock.calls;
  const options = calls[calls.length - 1]?.[0];
  if (!options || typeof options.queryFn !== 'function') throw new Error('Missing query');
  return {
    options,
    run: () => {
      if (typeof options.queryFn !== 'function') throw new Error('Missing query function');
      return options.queryFn({
        queryKey: options.queryKey,
        client: new QueryClient(),
        signal: new AbortController().signal,
        meta: undefined,
      });
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockProviderVersion = 1;
  mockProviderReady = true;
});
afterEach(() => jest.restoreAllMocks());

describe('ICA router recognition', () => {
  it('loads both generations from runtime registry when the packaged snapshot predates V3', async () => {
    mockRegistry.getChainAddresses.mockImplementation(async (chain: 'base' | 'arbitrum') => ({
      interchainAccountRouter: v2[chain],
      interchainAccountRouterV3: v3[chain],
    }));
    const [originRouters, destinationRouters] = await Promise.all([
      fetchIcaRouters(mockRegistry, 'base'),
      fetchIcaRouters(mockRegistry, 'arbitrum'),
    ]);

    for (const routers of [v2, v3]) {
      expect(
        isIcaMessage(
          { sender: addressToBytes32(routers.base), recipient: routers.arbitrum },
          originRouters,
          destinationRouters,
        ),
      ).toBe(true);
    }
    expect(
      isIcaMessage({ sender: v3.arbitrum, recipient: v3.base }, originRouters, destinationRouters),
    ).toBe(false);
    expect(
      isIcaMessage({ sender: owner, recipient: v3.arbitrum }, originRouters, destinationRouters),
    ).toBe(false);
  });

  it('uses runtime chain addresses in the message classification hook', () => {
    jest
      .mocked(useQueries)
      .mockReturnValue([{ data: [v2.base, v3.base] }, { data: [v2.arbitrum, v3.arbitrum] }]);
    expect(
      useIsIcaMessage({
        sender: v3.base,
        recipient: v3.arbitrum,
        originDomainId: 8453,
        destinationDomainId: 42161,
      }),
    ).toBe(true);
    expect(useQueries).toHaveBeenCalledWith(
      expect.objectContaining({
        queries: [
          expect.objectContaining({ queryKey: ['icaRouters', mockRegistry.getUri(), 'base'] }),
          expect.objectContaining({ queryKey: ['icaRouters', mockRegistry.getUri(), 'arbitrum'] }),
        ],
      }),
    );
  });

  it('classifies bundled snapshot routers before the runtime registry loads', () => {
    expect(icaRoutersQueryOptions(mockRegistry, 'base').placeholderData).toEqual([
      chainAddresses.base.interchainAccountRouter,
    ]);
    expect(icaRoutersQueryOptions(mockRegistry, undefined).placeholderData).toBeUndefined();
  });

  it('separates registry cache entries by source', () => {
    expect(
      icaRoutersQueryOptions({ ...mockRegistry, getUri: () => 'registry-custom' }, 'base').queryKey,
    ).not.toEqual(icaRoutersQueryOptions(mockRegistry, 'base').queryKey);
  });
});

describe('ICA account configuration', () => {
  for (const commitmentIsm of [zero, '0x' + '22'.repeat(20)]) {
    it(`uses the commitment ICA ISM ${commitmentIsm} instead of the reveal verifier`, () => {
      const committed = decodeIcaBody(
        utils.solidityPack(
          ['uint8', 'bytes32', 'bytes32', 'bytes32', 'bytes32'],
          [1, addressToBytes32(owner), utils.hexZeroPad(commitmentIsm, 32), userSalt, commitment],
        ),
      );
      const reveal = decodeIcaBody(
        utils.solidityPack(
          ['uint8', 'bytes32', 'bytes32'],
          [2, addressToBytes32('0x' + '33'.repeat(20)), commitment],
        ),
      );
      expect(getIcaAccountConfig(reveal, committed ?? undefined)).toEqual(committed);
      expect(getIcaAccountConfig(reveal, committed ?? undefined)?.ism).toBe(commitmentIsm);
      expect(getIcaAccountConfig(committed, reveal ?? undefined)).toBe(committed);
      expect(getIcaAccountConfig(reveal, undefined)).toBeUndefined();
    });
  }
});

describe('ICA provider queries', () => {
  it('derives the account with the exact V3 envelope routers while V2 remains usable', async () => {
    const call = jest
      .spyOn(mockProvider, 'call')
      .mockResolvedValue(utils.defaultAbiCoder.encode(['address'], [ica]));
    for (const routers of [v2, v3]) {
      useIcaAddress(
        'base',
        'arbitrum',
        owner,
        zero,
        userSalt,
        routers.base,
        addressToBytes32(routers.arbitrum),
      );
      expect(await lastQuery().run()).toBe(utils.getAddress(ica));
      const tx = await call.mock.calls[call.mock.calls.length - 1]?.[0];
      if (!tx) throw new Error('Missing router call');
      expect(await tx.to).toBe(utils.getAddress(routers.arbitrum));
      const iface = new utils.Interface([
        'function getLocalInterchainAccount(uint32,bytes32,bytes32,address,bytes32) view returns (address)',
      ]);
      const args = iface.decodeFunctionData('getLocalInterchainAccount', (await tx.data) ?? '');
      expect(Array.from(args)).toEqual([
        8453,
        addressToBytes32(owner),
        addressToBytes32(routers.base),
        zero,
        userSalt,
      ]);
    }
  });

  it('looks up the reveal verifier on the actual recipient router', async () => {
    const verifier = '0x' + '44'.repeat(20);
    const call = jest
      .spyOn(mockProvider, 'call')
      .mockResolvedValueOnce(utils.defaultAbiCoder.encode(['address'], [verifier]))
      .mockResolvedValueOnce(utils.defaultAbiCoder.encode(['string[]'], [['https://ccs.example']]));
    useCcipReadIsmUrls('arbitrum', '0x1234', IcaMessageType.REVEAL, addressToBytes32(v3.arbitrum));
    expect(await lastQuery().run()).toEqual({
      ismAddress: verifier,
      urls: ['https://ccs.example'],
    });
    const routerTx = await call.mock.calls[0]?.[0];
    const verifierTx = await call.mock.calls[1]?.[0];
    expect(await routerTx?.to).toBe(utils.getAddress(v3.arbitrum));
    expect(await verifierTx?.to).toBe(utils.getAddress(verifier));
  });

  it('separates routers and provider versions in cache and waits for readiness', () => {
    useIcaAddress('base', 'arbitrum', owner, zero, userSalt, v2.base, v2.arbitrum);
    const v2Key = lastQuery().options.queryKey;
    useIcaAddress('base', 'arbitrum', owner, zero, userSalt, v3.base, v3.arbitrum);
    const v3Key = lastQuery().options.queryKey;
    expect(v3Key).not.toEqual(v2Key);
    mockProviderVersion = 2;
    useIcaAddress('base', 'arbitrum', owner, zero, userSalt, v3.base, v3.arbitrum);
    expect(lastQuery().options.queryKey).not.toEqual(v3Key);
    mockProviderReady = false;
    useIcaAddress('base', 'arbitrum', owner, zero, userSalt, v3.base, v3.arbitrum);
    expect(lastQuery().options.enabled).toBe(false);
    useCcipReadIsmUrls('arbitrum', '0x1234', IcaMessageType.REVEAL, v3.arbitrum);
    expect(lastQuery().options.enabled).toBe(false);
  });
});

describe('related ICA messages', () => {
  it('ignores the same commitment on another router or destination in a batched transaction', () => {
    const body = utils.solidityPack(
      ['uint8', 'bytes32', 'bytes32', 'bytes32', 'bytes32'],
      [1, addressToBytes32(owner), utils.hexZeroPad(zero, 32), userSalt, commitment],
    );
    const matching: MessageStub = {
      id: 'matching',
      msgId: commitment,
      nonce: 1,
      status: MessageStatus.Delivered,
      sender: v3.base,
      recipient: v3.arbitrum,
      originChainId: 8453,
      originDomainId: 8453,
      destinationChainId: 42161,
      destinationDomainId: 42161,
      origin: { timestamp: 0, hash: commitment, from: owner, to: v3.base },
      body,
    };
    jest
      .mocked(parseMessageStubResult)
      .mockReturnValue([
        { ...matching, msgId: 'wrong-router', sender: v2.base, recipient: v2.arbitrum },
        { ...matching, msgId: 'wrong-domain', destinationDomainId: 1 },
        matching,
      ]);
    const result = useRelatedIcaMessage(
      commitment,
      8453,
      'reveal',
      commitment,
      IcaMessageType.REVEAL,
      matching,
    );
    expect(result.relatedMessage).toBe(matching);
    expect(result.relatedDecoded?.salt).toBe(userSalt);
  });
});
