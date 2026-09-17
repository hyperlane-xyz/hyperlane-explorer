/** @jest-environment jsdom */

import { act } from 'react';
import { createRoot } from 'react-dom/client';

import { Message, MessageStatus } from '../../types';
import { MessageDebugStatus, type MessageDebugResult } from '../debugger/types';
import { useMessageDeliveryStatus } from '../deliveryStatus/useMessageDeliveryStatus';
import { MessageSummaryRow } from './MessageSummaryRow';

jest.mock('@hyperlane-xyz/widgets', () => ({
  ChevronIcon: () => null,
  SpinnerIcon: () => null,
}));
jest.mock('@hyperlane-xyz/utils', () => ({
  toTitleCase: (value: string) => value[0].toUpperCase() + value.slice(1),
  trimToLength: (value: string) => value,
}));

jest.mock('../../components/icons/ChainLogo', () => ({ ChainLogo: () => null }));
jest.mock('../../metadataStore', () => ({
  useChainMetadataResolver: () => ({
    tryGetChainName: (domainId: number) => (domainId === 1 ? 'ethereum' : 'prom'),
  }),
  useStore: (selector: (state: { warpRouteChainAddressMap: object }) => unknown) =>
    selector({ warpRouteChainAddressMap: {} }),
}));
jest.mock('../chains/utils', () => ({
  getChainDisplayName: (_resolver: unknown, chainName: string) =>
    chainName[0].toUpperCase() + chainName.slice(1),
}));
jest.mock('../deliveryStatus/useMessageDeliveryStatus', () => ({
  useMessageDeliveryStatus: jest.fn(),
}));
jest.mock('../messages/cards/ContentDetailsCard', () => ({ ContentDetailsCard: () => null }));
jest.mock('../messages/cards/IcaDetailsCard', () => ({
  IcaDetailsCard: ({
    message,
    debugResult,
  }: {
    message: Message;
    debugResult?: MessageDebugResult;
  }) => (
    <div
      data-testid="ica-details"
      data-status={message.status}
      data-debug-status={debugResult?.status}
    />
  ),
}));
jest.mock('../messages/cards/TransactionCard', () => ({
  DestinationTransactionCard: ({
    status,
    transaction,
    isStatusFetching,
  }: {
    status: MessageStatus;
    transaction?: Message['destination'];
    isStatusFetching: boolean;
  }) => (
    <div
      data-testid="destination-transaction"
      data-status={status}
      data-tx-hash={transaction?.hash}
      data-fetching={isStatusFetching}
    />
  ),
}));
jest.mock('../messages/cards/WarpTransferDetailsCard', () => ({
  WarpTransferDetailsCard: () => null,
}));
jest.mock('../messages/ica', () => ({ isIcaMessage: () => true }));
jest.mock('../messages/utils', () => ({ parseWarpRouteMessageDetails: () => undefined }));

const mockUseMessageDeliveryStatus = jest.mocked(useMessageDeliveryStatus);

const origin = {
  timestamp: 1_000,
  hash: `0x${'1'.repeat(64)}`,
  from: `0x${'2'.repeat(40)}`,
  to: `0x${'3'.repeat(40)}`,
  blockHash: `0x${'4'.repeat(64)}`,
  blockNumber: 1,
  mailbox: `0x${'5'.repeat(40)}`,
  nonce: 1,
  gasLimit: 1,
  gasPrice: 1,
  effectiveGasPrice: 1,
  gasUsed: 1,
  cumulativeGasUsed: 1,
  maxFeePerGas: 1,
  maxPriorityPerGas: 1,
};

const pendingMessage: Message = {
  status: MessageStatus.Pending,
  id: '1',
  msgId: `0x${'6'.repeat(64)}`,
  nonce: 1,
  sender: `0x${'7'.repeat(40)}`,
  recipient: `0x${'8'.repeat(40)}`,
  originChainId: 1,
  originDomainId: 1,
  destinationChainId: 227,
  destinationDomainId: 227,
  origin,
  body: '0x',
};

const deliveredMessage: Message = {
  ...pendingMessage,
  status: MessageStatus.Delivered,
  destination: {
    ...origin,
    timestamp: 3_000,
    hash: `0x${'9'.repeat(64)}`,
  },
};

const debugResult: MessageDebugResult = {
  status: MessageDebugStatus.IcaCallFailure,
  description: 'Call 2 failed',
  icaDetails: {
    failedCallIndex: 1,
    totalCalls: 3,
    errorReason: 'execution reverted',
  },
};

const reactTestGlobal = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

beforeAll(() => {
  reactTestGlobal.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(() => {
  delete reactTestGlobal.IS_REACT_ACT_ENVIRONMENT;
});

beforeEach(() => {
  jest.clearAllMocks();
});

it('defers the live delivery check until the message is expanded', async () => {
  mockUseMessageDeliveryStatus.mockReturnValue({
    messageWithDeliveryStatus: pendingMessage,
    debugResult: undefined,
    isDeliveryStatusFetching: false,
  });
  const container = document.createElement('div');
  const root = createRoot(container);

  await act(async () => {
    root.render(<MessageSummaryRow message={pendingMessage} index={0} />);
  });

  expect(mockUseMessageDeliveryStatus).toHaveBeenCalledWith({
    message: pendingMessage,
    enabled: false,
  });

  await act(async () => root.unmount());
});

it('uses live delivery details when the scraper message is still pending', async () => {
  mockUseMessageDeliveryStatus.mockReturnValue({
    messageWithDeliveryStatus: deliveredMessage,
    debugResult: undefined,
    isDeliveryStatusFetching: false,
  });
  const container = document.createElement('div');
  const root = createRoot(container);

  await act(async () => {
    root.render(<MessageSummaryRow message={pendingMessage} index={0} forceExpanded={true} />);
  });

  expect(mockUseMessageDeliveryStatus).toHaveBeenCalledWith({
    message: pendingMessage,
    enabled: true,
  });
  expect(container.textContent).toContain('Delivered');
  expect(container.querySelector('[data-testid="destination-transaction"]')).toMatchObject({
    dataset: {
      status: MessageStatus.Delivered,
      txHash: deliveredMessage.destination?.hash,
      fetching: 'false',
    },
  });
  expect(container.querySelector('[data-testid="ica-details"]')).toMatchObject({
    dataset: { status: MessageStatus.Delivered },
  });

  await act(async () => root.unmount());
});

it('passes live ICA diagnostics to the details card', async () => {
  mockUseMessageDeliveryStatus.mockReturnValue({
    messageWithDeliveryStatus: pendingMessage,
    debugResult,
    isDeliveryStatusFetching: false,
  });
  const container = document.createElement('div');
  const root = createRoot(container);

  await act(async () => {
    root.render(<MessageSummaryRow message={pendingMessage} index={0} forceExpanded={true} />);
  });

  expect(container.querySelector('[data-testid="ica-details"]')).toMatchObject({
    dataset: {
      status: MessageStatus.Pending,
      debugStatus: MessageDebugStatus.IcaCallFailure,
    },
  });

  await act(async () => root.unmount());
});
