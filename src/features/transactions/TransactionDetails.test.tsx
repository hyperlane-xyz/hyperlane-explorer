/** @jest-environment jsdom */

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { CombinedError } from 'urql';

import { Message } from '../../types';
import { usePiChainMessageSearchQuery } from '../messages/pi-queries/usePiChainMessageQuery';
import { TransactionDetails } from './TransactionDetails';
import { useTransactionMessagesQuery } from './useTransactionMessagesQuery';

const mockStore = {
  ensureWarpRouteData: jest.fn(() => Promise.resolve()),
  isWarpRouteDataLoaded: false,
};
const mockProviderState = { multiProvider: {} as object | undefined, initFailed: false };

jest.mock('@hyperlane-xyz/widgets', () => ({ SpinnerIcon: () => null, Tooltip: () => null }));
jest.mock('../../metadataStore', () => ({
  useChainMetadataResolver: () => ({ tryGetChainName: () => 'ethereum' }),
  useStore: (selector: (state: typeof mockStore) => unknown) => selector(mockStore),
}));
jest.mock('../../store', () => ({
  useReadyMultiProvider: () => mockProviderState.multiProvider,
  useMultiProviderInitFailed: () => mockProviderState.initFailed,
}));
jest.mock('../messages/cards/OriginTransactionCard', () => ({ OriginTransactionCard: () => null }));
jest.mock('../messages/pi-queries/fetchPiChainMessages', () => ({
  PiQueryType: { TxHash: 'txHash' },
}));
jest.mock('../messages/pi-queries/usePiChainMessageQuery', () => ({
  usePiChainMessageSearchQuery: jest.fn(),
}));
jest.mock('./MessageSummaryRow', () => ({
  MessageSummaryRow: ({ message }: { message: Message }) => (
    <div data-testid="message-row" data-msg-id={message.msgId} />
  ),
}));
jest.mock('./useTransactionMessageCount', () => ({ useTransactionMessageCount: () => 0 }));
jest.mock('./useTransactionMessagesQuery', () => ({ useTransactionMessagesQuery: jest.fn() }));

const mockUseTransactionMessagesQuery = jest.mocked(useTransactionMessagesQuery);
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

function message(msgId: string, nonce: number) {
  return { msgId, nonce, originDomainId: 1, origin: {} } as Message;
}

function mockDbQuery(messageList: Message[], error?: CombinedError) {
  mockUseTransactionMessagesQuery.mockReturnValue({
    isFetching: false,
    isError: !!error,
    error,
    hasRun: true,
    isMessagesFound: messageList.length > 0,
    messageList,
    refetch: () => undefined,
  });
}

function mockFallbackQuery(messageList?: Message[]) {
  mockUsePiChainMessageSearchQuery.mockReturnValue({
    isFetching: !messageList,
    isError: false,
    hasRun: !!messageList,
    messageList: messageList ?? [],
    isMessagesFound: !!messageList?.length,
  });
}

function getView(container: HTMLElement) {
  const rowIds = Array.from(container.querySelectorAll('[data-testid="message-row"]')).map((row) =>
    row.getAttribute('data-msg-id'),
  );
  return { rowIds, text: container.textContent };
}

function render() {
  const container = document.createElement('div');
  const root = createRoot(container);
  act(() => root.render(<TransactionDetails txHash={txHash} />));
  const view = getView(container);
  act(() => root.unmount());
  return view;
}

describe('TransactionDetails', () => {
  beforeEach(() => {
    mockStore.ensureWarpRouteData.mockClear();
    mockProviderState.multiProvider = {};
    mockProviderState.initFailed = false;
    mockDbQuery([message('0xdb', 0)]);
    mockFallbackQuery([]);
  });

  it('loads warp route data so message rows can classify warp transfers', () => {
    mockStore.isWarpRouteDataLoaded = false;
    render();
    expect(mockStore.ensureWarpRouteData).toHaveBeenCalledTimes(1);
  });

  it('does not reload warp route data once loaded', () => {
    mockStore.isWarpRouteDataLoaded = true;
    render();
    expect(mockStore.ensureWarpRouteData).not.toHaveBeenCalled();
  });

  it('renders DB messages with the RPC fallback paused', () => {
    const { rowIds } = render();
    expect(rowIds).toEqual(['0xdb']);
    expect(mockUsePiChainMessageSearchQuery).toHaveBeenLastCalledWith({
      sanitizedInput: txHash,
      piQueryType: 'txHash',
      includeScrapedChains: true,
      pause: true,
    });
  });

  it('renders RPC fallback messages sorted by nonce when the DB has none', () => {
    mockDbQuery([]);
    mockFallbackQuery([message('0xb', 1), message('0xa', 0)]);
    const { rowIds } = render();
    expect(mockUsePiChainMessageSearchQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ pause: false }),
    );
    expect(rowIds).toEqual(['0xa', '0xb']);
  });

  it('replaces RPC fallback rows with DB rows once indexed', () => {
    mockDbQuery([]);
    mockFallbackQuery([message('0xa', 0)]);
    const container = document.createElement('div');
    const root = createRoot(container);
    act(() => root.render(<TransactionDetails txHash={txHash} />));
    expect(getView(container).rowIds).toEqual(['0xa']);

    mockDbQuery([message('0xdb', 0)]);
    act(() => root.render(<TransactionDetails txHash={txHash} />));
    expect(getView(container).rowIds).toEqual(['0xdb']);
    act(() => root.unmount());
  });

  it('shows the spinner while the RPC fallback is fetching', () => {
    mockDbQuery([]);
    mockFallbackQuery();
    const { text } = render();
    expect(text).toContain('Loading transaction messages...');
    expect(text).not.toContain('No messages found');
  });

  it('shows the spinner while the provider is pending', () => {
    mockDbQuery([]);
    mockProviderState.multiProvider = undefined;
    const { text } = render();
    expect(text).toContain('Loading transaction messages...');
    expect(text).not.toContain('No messages found');
  });

  it('shows not found once the RPC fallback finds nothing', () => {
    mockDbQuery([]);
    const { text } = render();
    expect(text).toContain('No messages found');
  });

  it('shows not found when the provider fails to init', () => {
    mockDbQuery([]);
    mockProviderState.multiProvider = undefined;
    mockProviderState.initFailed = true;
    const { text } = render();
    expect(text).toContain('No messages found');
  });

  it('prefers RPC fallback messages over a DB error', () => {
    mockDbQuery([], new CombinedError({ networkError: new Error('scraper down') }));
    mockFallbackQuery([message('0xa', 0)]);
    const { rowIds, text } = render();
    expect(rowIds).toEqual(['0xa']);
    expect(text).not.toContain('Error loading transaction');
  });
});
