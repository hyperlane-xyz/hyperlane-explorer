/** @jest-environment jsdom */

import { act } from 'react';
import { createRoot } from 'react-dom/client';

import { Message } from '../../types';
import { usePiChainMessageSearchQuery } from '../messages/pi-queries/usePiChainMessageQuery';
import { TransactionFallbackBridge } from './TransactionFallbackBridge';

const mockProviderState = { multiProvider: undefined as object | undefined, initFailed: false };

jest.mock('../../store', () => ({
  useReadyMultiProvider: () => mockProviderState.multiProvider,
  useMultiProviderInitFailed: () => mockProviderState.initFailed,
}));
jest.mock('../messages/pi-queries/fetchPiChainMessages', () => ({
  PiQueryType: { TxHash: 'txHash' },
}));
jest.mock('../messages/pi-queries/usePiChainMessageQuery', () => ({
  usePiChainMessageSearchQuery: jest.fn(),
}));

const mockUsePiChainMessageSearchQuery = jest.mocked(usePiChainMessageSearchQuery);

const reactTestGlobal = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

beforeAll(() => {
  reactTestGlobal.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(() => {
  delete reactTestGlobal.IS_REACT_ACT_ENVIRONMENT;
});

const txHash = `0x${'1'.repeat(64)}`;

function render(messageList: Message[] = []) {
  mockUsePiChainMessageSearchQuery.mockReturnValue({
    isFetching: false,
    isError: false,
    hasRun: true,
    messageList,
    isMessagesFound: messageList.length > 0,
  });
  const onStateChange = jest.fn();
  const root = createRoot(document.createElement('div'));
  act(() =>
    root.render(<TransactionFallbackBridge txHash={txHash} onStateChange={onStateChange} />),
  );
  act(() => root.unmount());
  return onStateChange.mock.lastCall?.[0];
}

describe('TransactionFallbackBridge', () => {
  beforeEach(() => {
    mockProviderState.multiProvider = {};
    mockProviderState.initFailed = false;
  });

  it('queries all EVM chains by tx receipt', () => {
    render();
    expect(mockUsePiChainMessageSearchQuery).toHaveBeenCalledWith({
      sanitizedInput: txHash,
      piQueryType: 'txHash',
      includeScrapedChains: true,
      pause: false,
    });
  });

  it('reports messages sorted by nonce', () => {
    const messages = [
      { msgId: '0xb', nonce: 2 },
      { msgId: '0xa', nonce: 1 },
    ] as Message[];
    expect(render(messages)).toEqual({
      hasRun: true,
      isFetching: false,
      messageList: [messages[1], messages[0]],
    });
  });

  it('stays pending until the provider is ready', () => {
    mockProviderState.multiProvider = undefined;
    expect(render()).toMatchObject({ hasRun: false, isFetching: true });
  });

  it('settles as not found when the provider fails to init', () => {
    mockProviderState.multiProvider = undefined;
    mockProviderState.initFailed = true;
    expect(render()).toMatchObject({ hasRun: true, isFetching: false });
  });
});
