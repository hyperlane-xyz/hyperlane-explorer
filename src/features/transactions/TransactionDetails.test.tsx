/** @jest-environment jsdom */

import { act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { CombinedError } from 'urql';

import { Message } from '../../types';
import { TransactionDetails } from './TransactionDetails';
import {
  DEFAULT_TRANSACTION_FALLBACK_STATE,
  TransactionFallbackState,
} from './transactionFallbackState';
import { useTransactionMessagesQuery } from './useTransactionMessagesQuery';

const mockStore = {
  ensureWarpRouteData: jest.fn(() => Promise.resolve()),
  isWarpRouteDataLoaded: false,
};
const mockBridgeRender = jest.fn();
let mockFallbackState: TransactionFallbackState = DEFAULT_TRANSACTION_FALLBACK_STATE;

jest.mock('@hyperlane-xyz/widgets', () => ({ SpinnerIcon: () => null, Tooltip: () => null }));
jest.mock('next/dynamic', () => ({
  __esModule: true,
  default: () =>
    function MockFallbackBridge({
      onStateChange,
    }: {
      onStateChange: (state: TransactionFallbackState) => void;
    }) {
      mockBridgeRender();
      useEffect(() => onStateChange(mockFallbackState), [onStateChange]);
      return null;
    },
}));
jest.mock('../../metadataStore', () => ({
  useChainMetadataResolver: () => ({ tryGetChainName: () => 'ethereum' }),
  useStore: (selector: (state: typeof mockStore) => unknown) => selector(mockStore),
}));
jest.mock('../messages/cards/OriginTransactionCard', () => ({ OriginTransactionCard: () => null }));
jest.mock('./MessageSummaryRow', () => ({
  MessageSummaryRow: ({ message }: { message: Message }) => (
    <div data-testid="message-row" data-msg-id={message.msgId} />
  ),
}));
jest.mock('./useTransactionMessageCount', () => ({ useTransactionMessageCount: () => 0 }));
jest.mock('./useTransactionMessagesQuery', () => ({ useTransactionMessagesQuery: jest.fn() }));

const mockUseTransactionMessagesQuery = jest.mocked(useTransactionMessagesQuery);

const reactTestGlobal = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

beforeAll(() => {
  reactTestGlobal.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(() => {
  delete reactTestGlobal.IS_REACT_ACT_ENVIRONMENT;
});

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

function render() {
  const container = document.createElement('div');
  const root = createRoot(container);
  act(() => root.render(<TransactionDetails txHash={`0x${'1'.repeat(64)}`} />));
  const rowIds = Array.from(container.querySelectorAll('[data-testid="message-row"]')).map((row) =>
    row.getAttribute('data-msg-id'),
  );
  const text = container.textContent;
  act(() => root.unmount());
  return { rowIds, text };
}

describe('TransactionDetails', () => {
  beforeEach(() => {
    mockStore.ensureWarpRouteData.mockClear();
    mockBridgeRender.mockClear();
    mockFallbackState = DEFAULT_TRANSACTION_FALLBACK_STATE;
    mockDbQuery([message('0xdb', 0)]);
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

  it('renders DB messages without running the RPC fallback', () => {
    const { rowIds } = render();
    expect(rowIds).toEqual(['0xdb']);
    expect(mockBridgeRender).not.toHaveBeenCalled();
  });

  it('renders RPC fallback messages when the DB has none', () => {
    mockDbQuery([]);
    mockFallbackState = {
      hasRun: true,
      isFetching: false,
      messageList: [message('0xa', 0), message('0xb', 1)],
    };
    const { rowIds } = render();
    expect(mockBridgeRender).toHaveBeenCalled();
    expect(rowIds).toEqual(['0xa', '0xb']);
  });

  it('shows the spinner while the RPC fallback is fetching', () => {
    mockDbQuery([]);
    mockFallbackState = { ...DEFAULT_TRANSACTION_FALLBACK_STATE, isFetching: true };
    const { text } = render();
    expect(text).toContain('Loading transaction messages...');
    expect(text).not.toContain('No messages found');
  });

  it('shows not found once the RPC fallback finds nothing', () => {
    mockDbQuery([]);
    mockFallbackState = { ...DEFAULT_TRANSACTION_FALLBACK_STATE, hasRun: true };
    const { text } = render();
    expect(text).toContain('No messages found');
  });

  it('prefers RPC fallback messages over a DB error', () => {
    mockDbQuery([], new CombinedError({ networkError: new Error('scraper down') }));
    mockFallbackState = { hasRun: true, isFetching: false, messageList: [message('0xa', 0)] };
    const { rowIds, text } = render();
    expect(rowIds).toEqual(['0xa']);
    expect(text).not.toContain('Error loading transaction');
  });
});
