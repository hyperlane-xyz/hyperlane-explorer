/** @jest-environment jsdom */

import { act } from 'react';
import { createRoot } from 'react-dom/client';

import { MessageStatus, type MessageStub } from '../../../types';
import { DestinationTransactionCard } from './TransactionCard';

jest.mock('@hyperlane-xyz/widgets', () => ({
  ErrorIcon: () => null,
  Modal: () => null,
  SpinnerIcon: () => null,
  Tooltip: () => null,
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
  useMultiProvider: () => ({
    tryGetChainMetadata: (domain: number) => (domain === 1 ? {} : undefined),
  }),
}));
jest.mock('../collateral/useCollateralStatus', () => ({
  useCollateralStatus: () => ({ status: 'unknown' }),
}));
jest.mock('./CodeBlock', () => ({ LabelAndCodeBlock: () => null }));
jest.mock('./CollateralCards', () => ({
  ActiveRebalanceModal: () => null,
  InsufficientCollateralWarning: () => null,
}));
jest.mock('./TransactionDetailsRows', () => ({ TransactionDetailsRows: () => null }));

const reactTestGlobal = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

beforeAll(() => {
  reactTestGlobal.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(() => {
  delete reactTestGlobal.IS_REACT_ACT_ENVIRONMENT;
});

it('shows a route halt warning before missing chain metadata', async () => {
  const container = document.createElement('div');
  const root = createRoot(container);
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
        status={MessageStatus.Pending}
        isStatusFetching={false}
        blur={false}
        message={message}
      />,
    );
  });

  expect(container.textContent).toContain('Route Halted');
  expect(container.textContent).not.toContain('Delivery status is unknown.');
  const link = container.querySelector('a');
  expect(link?.textContent).toBe('Read more about this');
  expect(link?.getAttribute('href')).toBe(
    'https://x.com/InfiniteTradePr/status/2090409024437039569',
  );
  expect(link?.getAttribute('target')).toBe('_blank');
  expect(link?.getAttribute('rel')).toBe('noopener noreferrer');
  await act(async () => root.unmount());
});

it('waits for origin confirmations before inspecting delivery, then shows normal delivery progress', async () => {
  const container = document.createElement('div');
  const root = createRoot(container);
  const render = async (isOriginConfirming: boolean) =>
    act(async () =>
      root.render(
        <DestinationTransactionCard
          chainName="ethereum"
          domainId={1}
          status={MessageStatus.Pending}
          isStatusFetching={isOriginConfirming}
          isOriginConfirming={isOriginConfirming}
          blur={false}
        />,
      ),
    );
  try {
    await render(true);
    expect(container.textContent).toContain('Waiting for origin confirmations.');
    expect(container.textContent).not.toContain('Delivery to destination chain still in progress.');
    await render(false);
    expect(container.textContent).not.toContain('Waiting for origin confirmations.');
    expect(container.textContent).toContain('Delivery to destination chain still in progress.');
  } finally {
    await act(async () => root.unmount());
  }
});

it.each([undefined, { hash: '0x01', timestamp: 1 }])(
  'keeps observed deliveries out of the confirmation state, even without indexed transaction details',
  async (transaction) => {
    const container = document.createElement('div');
    const root = createRoot(container);
    try {
      await act(async () =>
        root.render(
          <DestinationTransactionCard
            chainName="ethereum"
            domainId={1}
            status={MessageStatus.Delivered}
            transaction={transaction}
            isStatusFetching={false}
            isOriginConfirming={true}
            blur={false}
          />,
        ),
      );
      expect(container.textContent).not.toContain('Waiting for origin confirmations.');
      expect(container.textContent).not.toContain('Delivery status is currently unknown.');
      if (!transaction) expect(container.textContent).toContain('Message delivered.');
    } finally {
      await act(async () => root.unmount());
    }
  },
);
