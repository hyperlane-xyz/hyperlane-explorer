/** @jest-environment jsdom */

import { act } from 'react';
import { createRoot } from 'react-dom/client';

import { TransactionDetails } from './TransactionDetails';

const mockStore = {
  ensureWarpRouteData: jest.fn(() => Promise.resolve()),
  isWarpRouteDataLoaded: false,
};

jest.mock('@hyperlane-xyz/widgets', () => ({ SpinnerIcon: () => null, Tooltip: () => null }));
jest.mock('../../metadataStore', () => ({
  useStore: (selector: (state: typeof mockStore) => unknown) => selector(mockStore),
}));
jest.mock('../messages/cards/OriginTransactionCard', () => ({ OriginTransactionCard: () => null }));
jest.mock('./MessageSummaryRow', () => ({ MessageSummaryRow: () => null }));
jest.mock('./useTransactionMessageCount', () => ({ useTransactionMessageCount: () => 0 }));
jest.mock('./useTransactionMessagesQuery', () => ({
  useTransactionMessagesQuery: () => ({
    isFetching: false,
    isError: false,
    error: undefined,
    hasRun: true,
    isMessagesFound: true,
    messageList: [],
    originInfo: undefined,
    refetch: () => undefined,
  }),
}));

const reactTestGlobal = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

beforeAll(() => {
  reactTestGlobal.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(() => {
  delete reactTestGlobal.IS_REACT_ACT_ENVIRONMENT;
});

function render() {
  const root = createRoot(document.createElement('div'));
  act(() => root.render(<TransactionDetails txHash={`0x${'1'.repeat(64)}`} />));
  act(() => root.unmount());
}

describe('TransactionDetails', () => {
  beforeEach(() => mockStore.ensureWarpRouteData.mockClear());

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
});
