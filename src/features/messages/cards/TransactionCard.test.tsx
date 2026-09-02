/** @jest-environment jsdom */

import { act } from 'react';
import { createRoot } from 'react-dom/client';

import { MessageStatus, type MessageStub } from '../../../types';
import { MessageDebugStatus } from '../../debugger/types';
import { DestinationTransactionCard } from './TransactionCard';

const mockTryGetChainMetadata = jest.fn();

jest.mock('@hyperlane-xyz/widgets', () => ({
  ErrorIcon: () => null,
  Modal: () => null,
  SpinnerIcon: () => null,
  Tooltip: () => null,
  useModal: () => ({ isOpen: false, open: jest.fn(), close: jest.fn() }),
}));

jest.mock('next/dynamic', () => ({
  __esModule: true,
  default: () => () => <div data-testid="dynamic-component" />,
}));

jest.mock('../../../components/icons/ChainLogo', () => ({ ChainLogo: () => null }));
jest.mock('../../../components/layout/SectionCard', () => ({
  SectionCard: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('../../../store', () => ({
  useMultiProvider: () => ({ tryGetChainMetadata: mockTryGetChainMetadata }),
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

beforeEach(() => {
  mockTryGetChainMetadata.mockReturnValue(undefined);
});

afterAll(() => {
  delete reactTestGlobal.IS_REACT_ACT_ENVIRONMENT;
});

it('shows a halt warning before missing chain metadata', async () => {
  const container = document.createElement('div');
  const root = createRoot(container);
  const message = {
    originDomainId: 1783,
    destinationDomainId: 999999,
    sender: '0x1111111111111111111111111111111111111111',
    recipient: '0x2222222222222222222222222222222222222222',
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

  expect(container.textContent).toContain('Chain Halted');
  expect(container.textContent).not.toContain('Delivery status is unknown.');
  const link = container.querySelector('a');
  expect(link?.textContent).toBe('Read more about this');
  expect(link?.getAttribute('href')).toBe('https://x.com/KiiChainio/status/2091330990027296992');
  expect(link?.getAttribute('target')).toBe('_blank');
  expect(link?.getAttribute('rel')).toBe('noopener noreferrer');
  await act(async () => root.unmount());
});

it('offers self-relay when an EVM message is underfunded', async () => {
  mockTryGetChainMetadata.mockReturnValue({ protocol: 'ethereum' });
  const container = document.createElement('div');
  const root = createRoot(container);
  const message = {
    originDomainId: 42161,
    destinationDomainId: 1,
  } as MessageStub;

  await act(async () => {
    root.render(
      <DestinationTransactionCard
        chainName="ethereum"
        domainId={message.destinationDomainId}
        status={MessageStatus.Failing}
        debugResult={{
          status: MessageDebugStatus.GasUnderfunded,
          description: 'Origin IGP has not received any gas payments',
        }}
        isStatusFetching={false}
        blur={false}
        message={message}
      />,
    );
  });

  expect(container.textContent).toContain('Insufficient interchain gas');
  expect(container.querySelector('[data-testid="dynamic-component"]')).not.toBeNull();
  await act(async () => root.unmount());
});
