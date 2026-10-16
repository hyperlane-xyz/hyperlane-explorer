/** @jest-environment jsdom */

import { TextDecoder, TextEncoder } from 'util';

import { createEvmHypAdapter } from '@hyperlane-xyz/sdk/token/adapters/evmHyp';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

import { MessageStatus, type MessageStub, type WarpRouteDetails } from '../../../types';
import { CollateralStatus } from './types';

jest.mock('@hyperlane-xyz/sdk/token/adapters/evmHyp', () => ({
  createEvmHypAdapter: jest.fn(() => ({ getBalance: mockGetBalance })),
}));
jest.mock('@hyperlane-xyz/registry', () => ({ warpRouteConfigs: {} }));
jest.mock('../../../utils/logger', () => ({
  logger: { debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('../../../store', () => ({
  useReadyMultiProvider: () => (mockReady ? mockProvider : undefined),
  useMultiProviderVersion: () => 1,
}));

let TokenStandard: typeof import('@hyperlane-xyz/sdk/token/TokenStandard').TokenStandard;
let useCollateralStatus: typeof import('./useCollateralStatus').useCollateralStatus;

let mockReady = true;
const mockProvider = {
  tryGetChainMetadata: jest.fn(),
  tryGetProvider: jest.fn(),
};
const mockGetBalance = jest.fn();
const message: MessageStub = {
  status: MessageStatus.Pending,
  id: '1',
  msgId: '0x1',
  nonce: 0,
  sender: '0x1',
  recipient: '0x2',
  originChainId: 1,
  originDomainId: 1,
  destinationChainId: 2,
  destinationDomainId: 2,
  origin: { timestamp: 1, hash: '0x3' },
  body: '0x',
};
let token: WarpRouteDetails['destinationToken'];
let route: WarpRouteDetails;

beforeAll(async () => {
  // SDK dependencies expect browser globals absent from jsdom.
  Object.assign(globalThis, {
    TextDecoder,
    TextEncoder,
    fetch: jest.fn(() => {
      throw new Error('Unexpected network request');
    }),
  });
  ({ TokenStandard } = await import('@hyperlane-xyz/sdk/token/TokenStandard'));
  ({ useCollateralStatus } = await import('./useCollateralStatus'));
  token = {
    chainName: 'ethereum',
    addressOrDenom: '0x123',
    standard: TokenStandard.EvmHypCollateral,
    decimals: 6,
    symbol: 'USDC',
    name: 'USDC',
  };
  route = {
    amount: '1',
    destAmount: null,
    transferRecipient: '0x2',
    originToken: token,
    destinationToken: token,
  };
});

function Status({ destinationToken = token }: { destinationToken?: typeof token }) {
  const info = useCollateralStatus(message, { ...route, destinationToken });
  return <span>{info.status}</span>;
}

const reactTestGlobal = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};
let client: QueryClient;
let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  reactTestGlobal.IS_REACT_ACT_ENVIRONMENT = true;
  mockReady = true;
  mockProvider.tryGetChainMetadata.mockReturnValue({ protocol: 'ethereum' });
  mockGetBalance.mockReset().mockResolvedValue(2000000n);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  container = document.createElement('div');
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  jest.useRealTimers();
  delete reactTestGlobal.IS_REACT_ACT_ENVIRONMENT;
});

async function render(destinationToken = token) {
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <Status destinationToken={destinationToken} />
      </QueryClientProvider>,
    );
  });
  await act(async () => {
    await jest.advanceTimersByTimeAsync(1);
  });
}

it('skips the EVM query for Solana collateral and leaves its status unknown', async () => {
  mockProvider.tryGetChainMetadata.mockReturnValue({ protocol: 'sealevel' });
  await render({
    ...token,
    chainName: 'solanamainnet',
    standard: TokenStandard.SealevelHypCollateral,
    addressOrDenom: 'HW9NfLGo6YMoM6o5auTvn5h26tWJPpsroUDfGFwvsQsU',
  });
  expect(container.textContent).toBe(CollateralStatus.Unknown);
  expect(createEvmHypAdapter).not.toHaveBeenCalled();
  expect(client.isFetching()).toBe(0);
  expect(
    client
      .getQueryCache()
      .getAll()
      .every((query) => query.state.error === null),
  ).toBe(true);
});

it('waits for the ready provider before checking EVM collateral', async () => {
  mockReady = false;
  await render();
  expect(container.textContent).toBe(CollateralStatus.Unknown);
  expect(mockGetBalance).not.toHaveBeenCalled();
  mockReady = true;
  await render();
  expect(container.textContent).toBe(CollateralStatus.Sufficient);
});

it.each([
  [0n, CollateralStatus.Insufficient],
  [2000000n, CollateralStatus.Sufficient],
])('preserves a real EVM balance of %s', async (balance, status) => {
  mockGetBalance.mockResolvedValue(balance);
  await render();
  expect(container.textContent).toBe(status);
  expect(client.getQueryData(['collateralBalance', token.chainName, token.addressOrDenom, 1])).toBe(
    balance,
  );
});

it.each(['unsupported adapter', 'RPC failure'])(
  'caches unavailable collateral as null: %s',
  async (reason) => {
    if (reason === 'unsupported adapter')
      jest.mocked(createEvmHypAdapter).mockReturnValueOnce(undefined);
    else mockGetBalance.mockRejectedValue(new Error('RPC unavailable'));
    await render();
    expect(container.textContent).toBe(CollateralStatus.Unknown);
    const state = client.getQueryState([
      'collateralBalance',
      token.chainName,
      token.addressOrDenom,
      1,
    ]);
    expect(state?.data).toBeNull();
    expect(state?.error).toBeNull();
  },
);
