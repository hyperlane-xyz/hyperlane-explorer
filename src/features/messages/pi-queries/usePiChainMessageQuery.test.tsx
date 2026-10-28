/** @jest-environment jsdom */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { Message } from '../../../types';
import { logger } from '../../../utils/logger';
import type { DomainsEntry } from '../../chains/queries/fragments';
import { fetchMessagesFromPiChain, PiQueryType } from './fetchPiChainMessages';
import { usePiChainMessageQuery } from './usePiChainMessageQuery';

jest.mock('@hyperlane-xyz/utils', () => ({
  ensure0x: (value: string) => (value.startsWith('0x') ? value : `0x${value}`),
}));
jest.mock('../../../store', () => ({
  useReadyMultiProvider: () => (mockReady ? mockProvider : undefined),
  useMultiProviderVersion: () => mockProviderVersion,
  useMultiProviderInitFailed: () => mockInitFailed,
  useRegistry: () => mockRegistry,
}));
jest.mock('../../chains/queries/useScrapedChains', () => ({
  useScrapedDomains: () => ({ scrapedDomains: mockScrapedDomains }),
}));
jest.mock('../../chains/utils', () => ({
  isEvmChain: (_provider: unknown, domainId: number) => domainId !== 3,
  isPiChain: (_provider: unknown, scraped: DomainsEntry[], domainId: number) =>
    !scraped.some((chain) => chain.id === domainId),
}));
jest.mock('../queries/useMessageQuery', () => ({ isValidSearchQuery: () => true }));
jest.mock('./fetchPiChainMessages', () => ({
  PiQueryType: { MsgId: 'msgId' },
  fetchMessagesFromPiChain: jest.fn(),
}));

const mockProvider = {
  metadata: {
    one: { name: 'one', domainId: 1 },
    two: { name: 'two', domainId: 2 },
    solana: { name: 'solana', domainId: 3 },
  },
};
const mockRegistry = {};
let mockReady = true;
let mockInitFailed = false;
let mockProviderVersion = 0;
let mockScrapedDomains: DomainsEntry[] = [];
const msgId = `0x${'ab'.repeat(32)}`;
const message = { msgId } as Message;
const fetchMessages = jest.mocked(fetchMessagesFromPiChain);
let props: Parameters<typeof usePiChainMessageQuery>[0];
let state: ReturnType<typeof usePiChainMessageQuery>;
let root: Root;
let client: QueryClient;

function Probe() {
  state = usePiChainMessageQuery(props);
  return null;
}

async function render() {
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <Probe />
      </QueryClientProvider>,
    );
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeAll(() => Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }));
afterAll(() => Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT'));
beforeEach(() => {
  mockReady = true;
  mockInitFailed = false;
  mockProviderVersion = 0;
  mockScrapedDomains = [];
  props = { messageId: msgId, pause: false };
  fetchMessages.mockReset();
  fetchMessages.mockImplementation(async (chain) => (chain.domainId === 1 ? [message] : []));
  jest.spyOn(logger, 'debug').mockImplementation(() => {});
  jest.spyOn(logger, 'warn').mockImplementation(() => {});
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  root = createRoot(document.createElement('div'));
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  jest.restoreAllMocks();
});

it.each([msgId, msgId.slice(2), `0x${msgId.slice(2).toUpperCase()}`])(
  'finds a verified result after normalizing %s',
  async (input) => {
    props.messageId = input;
    await render();
    expect(state).toMatchObject({ hasRun: true, isMessageFound: true, message });
  },
);

it('passes receipt hints only to the matching EVM chain', async () => {
  const hash = `0x${'cd'.repeat(32)}`;
  props.lookupData = { originDomainId: 1, origin: { hash } };
  await render();
  expect(fetchMessages).toHaveBeenCalledTimes(2);
  expect(fetchMessages).toHaveBeenCalledWith(
    mockProvider.metadata.one,
    { input: msgId, transactionHash: hash },
    mockProvider,
    mockRegistry,
    PiQueryType.MsgId,
  );
  expect(fetchMessages).toHaveBeenCalledWith(
    mockProvider.metadata.two,
    { input: msgId, transactionHash: undefined },
    mockProvider,
    mockRegistry,
    PiQueryType.MsgId,
  );
});

it('ignores hints for a chain absent from the configured provider', async () => {
  props.lookupData = { originDomainId: 999, origin: { hash: `0x${'cd'.repeat(32)}` } };
  await render();
  expect(fetchMessages.mock.calls.every(([, query]) => query.transactionHash === undefined)).toBe(
    true,
  );
  expect(state.isMessageFound).toBe(true);
});

it('requeries when a hint or provider version changes', async () => {
  props.lookupData = { originDomainId: 1, origin: { hash: `0x${'cd'.repeat(32)}` } };
  await render();
  fetchMessages.mockClear();
  props = { ...props, lookupData: { originDomainId: 1, origin: { hash: `0x${'ef'.repeat(32)}` } } };
  await render();
  expect(fetchMessages).toHaveBeenCalledTimes(2);
  expect(fetchMessages.mock.calls[0][1].transactionHash).toBe(props.lookupData!.origin.hash);
  fetchMessages.mockClear();
  mockProviderVersion++;
  await render();
  expect(fetchMessages).toHaveBeenCalledTimes(2);
});

it('requeries when scraped-chain metadata changes', async () => {
  await render();
  fetchMessages.mockClear();
  mockScrapedDomains = [
    {
      id: 1,
      name: 'one',
      chain_id: 1,
      native_token: 'ETH',
      is_test_net: false,
      is_deprecated: false,
    },
  ];
  await render();
  expect(fetchMessages).toHaveBeenCalledTimes(1);
  expect(fetchMessages.mock.calls[0][0].domainId).toBe(2);
});

it('waits for a provider, then reports terminal initialization failure', async () => {
  mockReady = false;
  await render();
  expect(state).toMatchObject({ hasRun: false, isError: false, isFetching: false });
  expect(fetchMessages).not.toHaveBeenCalled();
  mockInitFailed = true;
  await render();
  expect(state).toMatchObject({ hasRun: true, isError: true, isFetching: false });
  mockInitFailed = false;
  mockReady = true;
  await render();
  expect(state).toMatchObject({ hasRun: true, isError: false, isMessageFound: true });
});

it('reports RPC failure as an error instead of a missing message', async () => {
  fetchMessages.mockRejectedValue(new Error('RPC unavailable'));
  await render();
  expect(state).toMatchObject({
    hasRun: true,
    isError: true,
    isFetching: false,
    isMessageFound: false,
  });
});

it('retains a verified result when another chain fails', async () => {
  fetchMessages.mockImplementation(async (chain) => {
    if (chain.domainId === 1) return [message];
    throw new Error('unrelated chain unavailable');
  });
  await render();
  expect(state).toMatchObject({ hasRun: true, isError: false, isMessageFound: true, message });
});

it('does not query or report provider errors while paused', async () => {
  props.pause = true;
  mockReady = false;
  mockInitFailed = true;
  await render();
  expect(fetchMessages).not.toHaveBeenCalled();
  expect(state.isError).toBe(false);
});
