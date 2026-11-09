/** @jest-environment jsdom */

import { act } from 'react';
import { createRoot } from 'react-dom/client';

import { MessageStatus, type MessageStub } from '../../../types';
import { CollateralInfo, CollateralStatus } from '../collateral/types';
import { DestinationTransactionCard } from './TransactionCard';

jest.mock('@hyperlane-xyz/widgets', () => ({
  Modal: () => null,
  SpinnerIcon: () => null,
  useModal: () => ({ isOpen: false, open: jest.fn(), close: jest.fn() }),
}));

jest.mock('next/dynamic', () => ({
  __esModule: true,
  default: () => () => null,
}));

jest.mock('../../../components/icons/ChainLogo', () => ({ ChainLogo: () => null }));
jest.mock('../../../components/layout/SectionCard', () => ({
  SectionCard: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('../../../store', () => ({
  useMultiProvider: () => ({ tryGetChainMetadata: () => undefined }),
}));
jest.mock('../collateral/useCollateralStatus', () => ({
  useCollateralStatus: () => mockCollateralInfo,
}));
jest.mock('./CodeBlock', () => ({ LabelAndCodeBlock: () => null }));
jest.mock('./TransactionDetailsRows', () => ({ TransactionDetailsRows: () => null }));
jest.mock('./TransactionRecordCard', () => ({
  TransactionRecordCard: ({ children }: { children: React.ReactNode }) => children,
  transactionHelpText: { destination: 'Delivery details' },
}));
jest.mock('./DestinationExecutionCost', () => ({ DestinationExecutionCost: () => null }));

let mockCollateralInfo: CollateralInfo = { status: CollateralStatus.Unknown };

beforeEach(() => {
  mockCollateralInfo = { status: CollateralStatus.Unknown };
});

const reactTestGlobal = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

beforeAll(() => {
  reactTestGlobal.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(() => {
  delete reactTestGlobal.IS_REACT_ACT_ENVIRONMENT;
});

it('keeps the delivery card loading while delivery issues are shown elsewhere', async () => {
  const container = document.createElement('div');
  const root = createRoot(container);
  mockCollateralInfo = {
    status: CollateralStatus.Insufficient,
    available: 1n,
    required: 2n,
    deficit: 1n,
  };
  const message = {
    originDomainId: 10,
    destinationDomainId: 8453,
    sender: '0xb231e9c3bc267db389e3bf5d6ab26ca078c6123b',
    recipient: '0xba8cd87120aca631f59231f9fd6c5469bbee3440',
  } as MessageStub;

  await act(async () => {
    root.render(
      <DestinationTransactionCard
        chainName="unknown"
        domainId={message.destinationDomainId}
        status={MessageStatus.Failing}
        isStatusFetching={false}
        blur={false}
        message={message}
      />,
    );
  });

  expect(container.textContent).toContain('Delivery to destination chain still in progress.');
  expect(container.textContent).not.toContain('Route Halted');
  expect(container.textContent).not.toContain('Insufficient Collateral');
  expect(container.textContent).not.toContain('Delivery status is unknown.');
  await act(async () => root.unmount());
});

it('reports existing collateral results only when the status or listener changes', async () => {
  const container = document.createElement('div');
  const root = createRoot(container);
  const onInfo = jest.fn();
  const render = (onCollateralInfoChange = onInfo) =>
    act(async () => {
      root.render(
        <DestinationTransactionCard
          chainName="unknown"
          domainId={1}
          status={MessageStatus.Pending}
          isStatusFetching={false}
          blur={false}
          onCollateralInfoChange={onCollateralInfoChange}
        />,
      );
    });

  await render();
  expect(onInfo).toHaveBeenLastCalledWith({ status: CollateralStatus.Unknown });
  mockCollateralInfo = {
    status: CollateralStatus.Insufficient,
    available: 180_400_000n,
    required: 41_000_000_000n,
    deficit: 40_819_600_000n,
  };
  await render();
  expect(onInfo).toHaveBeenLastCalledWith(mockCollateralInfo);
  await render();
  expect(onInfo).toHaveBeenCalledTimes(2);
  const nextListener = jest.fn();
  await render(nextListener);
  expect(nextListener).toHaveBeenCalledWith(mockCollateralInfo);
  await act(async () => root.unmount());
});
