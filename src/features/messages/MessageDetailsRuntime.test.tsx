/** @jest-environment jsdom */
import { act } from 'react';
import { createRoot } from 'react-dom/client';

import { MessageStatus, type MessageStub } from '../../types';
import { CollateralInfo, CollateralStatus } from './collateral/types';
import { MessageDetailsRuntime } from './MessageDetailsRuntime';

jest.mock('./diagnostics/useOriginConfirmationTimestamp', () => ({
  useOriginConfirmationTimestamp: () => undefined,
}));

jest.mock('next/dynamic', () => ({ __esModule: true, default: () => () => null }));
jest.mock('./cards/TransactionCard', () => ({
  DestinationTransactionCard: ({
    onCollateralInfoChange,
  }: {
    onCollateralInfoChange: (info: CollateralInfo) => void;
  }) => {
    if (mockSuspendCard) throw mockCardLoading;
    mockOnCollateralInfoChange = onCollateralInfoChange;
    return <div>Loaded transaction details</div>;
  },
}));
jest.mock('./cards/OriginTransactionCard', () => ({
  DestinationTransactionPreviewCard: ({
    transaction,
  }: {
    transaction?: MessageStub['destination'];
  }) => <div>{transaction?.hash}</div>,
}));
jest.mock('../deliveryStatus/useMessageDeliveryStatus', () => ({
  useMessageDeliveryStatus: ({ message }: { message: MessageStub }) => ({
    messageWithDeliveryStatus: message,
    isDeliveryStatusFetching: false,
  }),
}));

let mockOnCollateralInfoChange: (info: CollateralInfo) => void;
let mockSuspendCard = false;
const mockCardLoading = new Promise<void>(() => {});
const reactTestGlobal = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

it('keeps transaction data visible while the enriched card loads', async () => {
  reactTestGlobal.IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div');
  const root = createRoot(container);
  mockSuspendCard = true;
  const message = {
    msgId: 'delivered',
    status: MessageStatus.Delivered,
    destination: { hash: '0x-delivery-from-websocket', timestamp: 123_000 },
  } as MessageStub;
  try {
    await act(async () =>
      root.render(
        <MessageDetailsRuntime
          messageId={message.msgId}
          baseMessage={message}
          baseIsMessageFound
          hasInitialMessageDetails
          hasGraphQlRun
          isGraphQlMessageFound
          destinationChainName="destination"
          blur={false}
          isOriginConfirming={false}
          onStateChange={jest.fn()}
        />,
      ),
    );
    expect(container.textContent).toContain(message.destination!.hash);
    expect(container.textContent).not.toContain('Loaded transaction details');
  } finally {
    mockSuspendCard = false;
    await act(async () => root.unmount());
    delete reactTestGlobal.IS_REACT_ACT_ENVIRONMENT;
  }
});

it('isolates collateral status when navigating to another message, including late old callbacks', async () => {
  reactTestGlobal.IS_REACT_ACT_ENVIRONMENT = true;
  const root = createRoot(document.createElement('div'));
  const onStateChange = jest.fn();
  const first = { msgId: 'first', status: MessageStatus.Pending } as MessageStub;
  const second = { msgId: 'second', status: MessageStatus.Pending } as MessageStub;
  const render = (message: MessageStub) =>
    act(async () => {
      root.render(
        <MessageDetailsRuntime
          messageId={message.msgId}
          baseMessage={message}
          baseIsMessageFound
          hasInitialMessageDetails
          hasGraphQlRun
          isGraphQlMessageFound
          destinationChainName="destination"
          blur={false}
          isOriginConfirming={false}
          onStateChange={onStateChange}
        />,
      );
    });

  await render(first);
  const firstListener = mockOnCollateralInfoChange;
  await act(async () =>
    firstListener({ status: CollateralStatus.Insufficient, deficit: 40_819_600_000n }),
  );
  expect(onStateChange).toHaveBeenLastCalledWith(
    expect.objectContaining({
      message: first,
      collateralInfo: { status: CollateralStatus.Insufficient, deficit: 40_819_600_000n },
    }),
  );
  await render(second);
  const secondListener = mockOnCollateralInfoChange;
  expect(onStateChange).toHaveBeenLastCalledWith(
    expect.objectContaining({
      message: second,
      collateralInfo: { status: CollateralStatus.Unknown },
    }),
  );
  await act(async () => firstListener({ status: CollateralStatus.Insufficient }));
  expect(onStateChange).toHaveBeenLastCalledWith(
    expect.objectContaining({
      message: second,
      collateralInfo: { status: CollateralStatus.Unknown },
    }),
  );
  await act(async () => secondListener({ status: CollateralStatus.Sufficient }));
  expect(onStateChange).toHaveBeenLastCalledWith(
    expect.objectContaining({
      message: second,
      collateralInfo: { status: CollateralStatus.Sufficient },
    }),
  );
  await act(async () => root.unmount());
  delete reactTestGlobal.IS_REACT_ACT_ENVIRONMENT;
});
