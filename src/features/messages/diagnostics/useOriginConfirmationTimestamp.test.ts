/** @jest-environment jsdom */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { useMultiProviderVersion, useReadyMultiProvider } from '../../../store';
import type { MessageStub } from '../../../types';
import type { OriginConfirmation } from './useOriginConfirmation';
import {
  useOriginConfirmationTimestamp,
  type OriginConfirmationTimestamp,
} from './useOriginConfirmationTimestamp';

jest.mock('../../../store', () => ({
  useReadyMultiProvider: jest.fn(),
  useMultiProviderVersion: jest.fn(),
}));
jest.mock('../../../utils/logger', () => ({ logger: { warn: jest.fn() } }));
jest.mock('@hyperlane-xyz/utils', () => ({
  ProtocolType: { Ethereum: 'ethereum', Tron: 'tron' },
  timeout: (promise: Promise<unknown>) => promise,
}));

const message = {
  originDomainId: 1,
  origin: { hash: 'dispatch', blockNumber: 100, timestamp: 1_000 },
} as MessageStub;
const getBlock = jest.fn(async (_height: number) => ({ timestamp: 1_060 }));
const provider = {
  tryGetProtocol: jest.fn(() => 'ethereum'),
  getEthersV5Provider: jest.fn(() => ({ getBlock })),
  getTronProvider: jest.fn(() => ({ getBlock })),
};
let confirmation: OriginConfirmation;
let result: OriginConfirmationTimestamp | undefined;
let root: Root;
let client: QueryClient;

function Probe() {
  result = useOriginConfirmationTimestamp(message, confirmation);
  return null;
}
async function render() {
  await act(async () => {
    root.render(createElement(QueryClientProvider, { client }, createElement(Probe)));
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeAll(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
});
afterAll(() => {
  Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
});
beforeEach(() => {
  jest.clearAllMocks();
  provider.tryGetProtocol.mockReturnValue('ethereum');
  message.origin.timestamp = 1_000;
  Reflect.deleteProperty(message.origin, 'blockHash');
  jest.mocked(useMultiProviderVersion).mockReturnValue(1);
  jest
    .mocked(useReadyMultiProvider)
    .mockReturnValue(provider as unknown as NonNullable<ReturnType<typeof useReadyMultiProvider>>);
  confirmation = { required: 5, blockNumber: 105, confirmed: true, tracked: true };
  result = undefined;
  root = createRoot(document.createElement('div'));
  client = new QueryClient();
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
});

test('waits for a ready provider, reads the exact block, and refreshes after provider replacement', async () => {
  jest.mocked(useReadyMultiProvider).mockReturnValue(undefined);
  await render();
  expect(getBlock).not.toHaveBeenCalled();
  jest
    .mocked(useReadyMultiProvider)
    .mockReturnValue(provider as unknown as NonNullable<ReturnType<typeof useReadyMultiProvider>>);
  await render();
  expect(getBlock).toHaveBeenCalledWith(105);
  expect(result).toEqual({ blockNumber: 105, timestamp: 1_060_000 });
  jest.mocked(useMultiProviderVersion).mockReturnValue(2);
  await render();
  expect(getBlock).toHaveBeenCalledTimes(2);
  Object.assign(message.origin, { blockHash: 'replacement-block', timestamp: 2_000 });
  await render();
  expect(getBlock).toHaveBeenCalledTimes(3);
  confirmation = { ...confirmation, confirmed: false };
  await render();
  expect(result).toBeUndefined();
  expect(getBlock).toHaveBeenCalledTimes(3);
});

test('does not fetch pending, zero-depth, block-tag, or unsupported-VM timestamps', async () => {
  for (const value of [
    { ...confirmation, confirmed: false },
    { ...confirmation, required: 0 },
    { ...confirmation, required: undefined, blockNumber: undefined },
  ]) {
    confirmation = value;
    await render();
    expect(result).toBeUndefined();
  }
  confirmation = { required: 5, blockNumber: 105, confirmed: true, tracked: true };
  provider.tryGetProtocol.mockReturnValue('sealevel');
  await render();
  expect(getBlock).not.toHaveBeenCalled();
});

test('retains existing Tron runtime support without adding provider builders', async () => {
  provider.tryGetProtocol.mockReturnValue('tron');
  await render();
  expect(provider.getTronProvider).toHaveBeenCalledWith(1);
  expect(provider.getEthersV5Provider).not.toHaveBeenCalled();
  expect(result).toEqual({ blockNumber: 105, timestamp: 1_060_000 });
});
