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
  useMultiProvider: () => ({ tryGetChainMetadata: () => undefined }),
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
