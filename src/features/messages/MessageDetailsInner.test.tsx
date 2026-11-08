/** @jest-environment jsdom */
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';

import { MessageStatus, type MessageStub } from '../../types';
import { MessageDebugStatus } from '../debugger/types';
import { CollateralStatus } from './collateral/types';
import { MessageDetailsInner } from './MessageDetailsInner';
import type { MessageDetailsRuntimeState } from './MessageDetailsRuntime';

jest.mock('next/dynamic', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    __esModule: true,
    default: (loader: () => Promise<React.ComponentType<Record<string, unknown>>>) => {
      const Component = React.lazy(() => loader().then((component) => ({ default: component })));
      return function Dynamic(props: Record<string, unknown>) {
        return (
          <React.Suspense fallback={null}>
            <Component {...props} />
          </React.Suspense>
        );
      };
    },
  };
});
jest.mock('react-toastify', () => ({ toast: { error: jest.fn() } }));
jest.mock('../../consts/aeroVoterRoutes', () => ({ isAeroVoterMessage: () => false }));
jest.mock('../../consts/pausedRoutes', () => ({ getMessagePause: () => undefined }));
jest.mock('../../metadataStore', () => ({
  useChainMetadataResolver: () => mockMetadata,
  useStore: (select: (state: typeof mockStore) => unknown) => select(mockStore),
}));
jest.mock('../transactions/useTransactionMessageCount', () => ({
  useTransactionMessageCount: () => 1,
}));
jest.mock('./queries/useMessageQuery', () => ({ useMessageQuery: () => mockQuery }));
jest.mock('./ica', () => ({ useIsIcaMessage: () => false }));
jest.mock('./utils', () => ({ parseWarpRouteMessageDetails: () => undefined }));
jest.mock('./useConfirmationProgress', () => ({ isWaitingForOriginConfirmations: () => false }));
jest.mock('./diagnostics/useOriginConfirmation', () => ({
  useOriginConfirmation: () => ({ confirmed: false, tracked: false }),
}));
jest.mock('./diagnostics/MessageDiagnosticsContext', () => ({
  MessageDiagnosticsProvider: ({ children }: { children: ReactNode }) => children,
}));
jest.mock('./cards/MessageOverviewCard', () => ({ MessageOverviewCard: () => null }));
jest.mock('./cards/MessageRelayActivityPanel', () => ({ MessageRelayActivityPanel: () => null }));
jest.mock('./cards/MessageDiagnosticsCard', () => ({ MessageDiagnosticsCard: () => null }));
jest.mock('./cards/AeroVoterDetailsCard', () => ({ AeroVoterDetailsCard: () => null }));
jest.mock('./cards/IcaDetailsCard', () => ({ IcaDetailsCard: () => null }));
jest.mock('./cards/IsmDetailsCard', () => ({ IsmDetailsCard: () => null }));
jest.mock('./cards/WarpRouteVisualizationCard', () => ({ WarpRouteVisualizationCard: () => null }));
jest.mock('./cards/ContentDetailsCard', () => ({
  ContentDetailsCard: () => <section data-testid="envelope">Message envelope</section>,
}));
jest.mock('./cards/OriginGasPaymentDetails', () => ({
  OriginGasPaymentDetails: (props: unknown) => {
    mockFunding(props);
    return <p>Funding details</p>;
  },
}));
jest.mock('./cards/MessageLifecycleCard', () => ({
  MessageLifecycleCard: ({ notice }: { notice?: ReactNode }) => <section>{notice}</section>,
}));
jest.mock('./cards/OriginTransactionCard', () => ({
  OriginTransactionCard: ({ children }: { children?: ReactNode }) => (
    <section data-testid="origin-transaction">Origin transaction{children}</section>
  ),
  DestinationTransactionPreviewCard: () => <section>Destination preview</section>,
}));
jest.mock('./MessageDetailsRuntime', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    MessageDetailsRuntime: (props: {
      messageId: string;
      onStateChange: (state: MessageDetailsRuntimeState) => void;
    }) => {
      mockRuntimeStateChange = props.onStateChange;
      const initialMessageId = React.useRef(props.messageId);
      React.useEffect(() => {
        const messageId = initialMessageId.current;
        mockRuntimeMount(messageId);
        return () => {
          mockRuntimeUnmount(messageId);
        };
      }, []);
      return <section data-testid="runtime">Destination transaction {props.messageId}</section>;
    },
  };
});

const mockMetadata = { tryGetChainName: (domain: number) => String(domain) };
const mockStore = {
  ensureChainMetadata: jest.fn().mockResolvedValue(undefined),
  ensureWarpRouteData: jest.fn().mockResolvedValue(undefined),
  isWarpRouteDataLoaded: true,
  warpRouteChainAddressMap: {},
  setBanner: jest.fn(),
};
let mockQuery: {
  isFetching: boolean;
  isError: boolean;
  hasRun: boolean;
  isMessageFound: boolean;
  message?: MessageStub;
};
const mockRuntimeMount = jest.fn();
const mockRuntimeUnmount = jest.fn();
const mockFunding = jest.fn();
let mockRuntimeStateChange: (state: MessageDetailsRuntimeState) => void;
const reactTestGlobal = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

it('keeps lookup mounted outside tabs, reveals transactions below content, and resets runtime by message ID', async () => {
  reactTestGlobal.IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const render = (messageId: string) =>
    act(async () => {
      root.render(<MessageDetailsInner messageId={messageId} />);
    });
  mockQuery = { isFetching: true, isError: false, hasRun: false, isMessageFound: false };
  try {
    await render('first');
    const runtime = container.querySelector('[data-testid="runtime"]')!;
    expect(runtime).not.toBeNull();
    const transactions = runtime.parentElement!.parentElement!;
    expect(transactions.hidden).toBe(true);
    expect(mockRuntimeMount).toHaveBeenCalledTimes(1);

    const message = {
      msgId: 'first',
      status: MessageStatus.Pending,
      originDomainId: 1,
      destinationDomainId: 2,
      origin: { hash: 'origin', timestamp: 1000 },
      sender: 'sender',
      recipient: 'recipient',
      body: '0x',
    } as MessageStub;
    mockQuery = { isFetching: false, isError: false, hasRun: true, isMessageFound: true, message };
    await render('first');
    expect(transactions.hidden).toBe(false);
    expect(container.querySelector('[data-testid="runtime"]')).toBe(runtime);
    expect(container.querySelector('[data-testid="envelope"]')?.nextElementSibling).toBe(
      transactions,
    );
    const technical = container.querySelector('[aria-label="Message activity and diagnostics"]')!;
    expect(transactions.nextElementSibling).toBe(technical);
    expect(technical.contains(runtime)).toBe(false);
    expect(container.querySelector('[data-testid="envelope"]')?.textContent).not.toContain(
      'Funding details',
    );
    expect(container.querySelector('[data-testid="origin-transaction"]')?.textContent).toContain(
      'Funding details',
    );

    const payments = { mailbox: [] };
    await act(async () =>
      mockRuntimeStateChange({
        hasRun: true,
        isFetching: false,
        isError: false,
        isMessageFound: true,
        message,
        isDeliveryStatusFetching: false,
        collateralStatus: CollateralStatus.Insufficient,
        debugResult: {
          status: MessageDebugStatus.NoErrorsFound,
          description: '',
          gasDetails: { contractToPayments: payments },
        },
      }),
    );
    expect(mockFunding).toHaveBeenLastCalledWith(
      expect.objectContaining({ message, blur: false, igpPayments: payments }),
    );
    expect(container.textContent).toContain(
      'See the destination transaction below for balances and rebalance status.',
    );
    await act(async () =>
      [...technical.querySelectorAll<HTMLButtonElement>('[role="tab"]')]
        .find((tab) => tab.textContent === 'Details')!
        .click(),
    );
    expect(technical.textContent).toContain(
      'No additional application details were detected for this message.',
    );
    expect(mockRuntimeMount).toHaveBeenCalledTimes(1);
    expect(mockRuntimeUnmount).not.toHaveBeenCalled();

    mockQuery = { isFetching: true, isError: false, hasRun: false, isMessageFound: false };
    await render('second');
    expect(mockRuntimeMount).toHaveBeenCalledTimes(2);
    expect(mockRuntimeUnmount).toHaveBeenCalledWith('first');
    expect(container.querySelector('[data-testid="runtime"]')?.textContent).toContain('second');
    expect(transactions.hidden).toBe(true);
    expect(container.querySelector('[data-testid="envelope"]')).toBeNull();
  } finally {
    await act(async () => root.unmount());
    container.remove();
    delete reactTestGlobal.IS_REACT_ACT_ENVIRONMENT;
  }
});
