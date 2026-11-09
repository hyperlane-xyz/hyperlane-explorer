/** @jest-environment jsdom */
import { act } from 'react';
import { createRoot } from 'react-dom/client';

import { MessageStatus, type MessageStub } from '../../types';
import { CollateralInfo, CollateralStatus } from './collateral/types';
import { MessageDetailsRuntime } from './MessageDetailsRuntime';

jest.mock('next/dynamic', () => ({
  __esModule: true,
  default:
    () =>
    ({ onCollateralInfoChange }: { onCollateralInfoChange: (info: CollateralInfo) => void }) => {
      mockOnCollateralInfoChange = onCollateralInfoChange;
      return null;
    },
}));
jest.mock('../deliveryStatus/useMessageDeliveryStatus', () => ({
  useMessageDeliveryStatus: ({ message }: { message: MessageStub }) => ({
    messageWithDeliveryStatus: message,
    isDeliveryStatusFetching: false,
  }),
}));
// These virtual mocks keep the no-confirmation-RPC boundary test even after the
// unused timestamp modules are removed.
jest.mock(
  './diagnostics/useOriginConfirmationTimestamp',
  () => ({ useOriginConfirmationTimestamp: mockConfirmationLookup }),
  { virtual: true },
);
jest.mock(
  './diagnostics/useDestinationConfirmationTimestamp',
  () => ({ useDestinationConfirmationTimestamp: mockConfirmationLookup }),
  { virtual: true },
);

let mockOnCollateralInfoChange: (info: CollateralInfo) => void;
const mockConfirmationLookup = jest.fn();
const messageFixture: MessageStub = {
  id: 'first',
  msgId: 'first',
  status: MessageStatus.Pending,
  nonce: 1,
  sender: '0x1111111111111111111111111111111111111111',
  recipient: '0x2222222222222222222222222222222222222222',
  originChainId: 1,
  originDomainId: 1,
  destinationChainId: 8453,
  destinationDomainId: 8453,
  origin: { hash: '0xorigin', timestamp: 1_000_000 },
  destination: { hash: '0xdestination', timestamp: 1_010_000, blockNumber: 100 },
  body: '0x',
};

beforeAll(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
});

afterAll(() => {
  Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
});

beforeEach(() => {
  mockConfirmationLookup.mockReset();
});

it('isolates collateral status when navigating to another message, including late old callbacks', async () => {
  const root = createRoot(document.createElement('div'));
  const onStateChange = jest.fn();
  const first = messageFixture;
  const second = { ...messageFixture, msgId: 'second' };
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
});

it('renders pending and confirmed messages without confirmation timestamp RPC lookups', async () => {
  const root = createRoot(document.createElement('div'));
  const onStateChange = jest.fn();
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

  try {
    await render(messageFixture);
    expect(onStateChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ message: messageFixture, isMessageFound: true }),
    );

    const provisional = {
      ...messageFixture,
      status: MessageStatus.Delivered,
      isProvisional: true,
    };
    await render(provisional);
    expect(onStateChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ message: provisional }),
    );

    const confirmed = { ...provisional, isProvisional: false };
    await render(confirmed);
    expect(onStateChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ message: confirmed, isMessageFound: true }),
    );

    const unknown = { ...confirmed, isProvisional: undefined };
    await render(unknown);
    expect(onStateChange).toHaveBeenLastCalledWith(expect.objectContaining({ message: unknown }));
    expect(mockConfirmationLookup).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
  }
});
