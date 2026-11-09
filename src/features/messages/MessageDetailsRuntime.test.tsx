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
jest.mock('./diagnostics/useOriginConfirmationTimestamp', () => ({
  useOriginConfirmationTimestamp: () => undefined,
}));

let mockOnCollateralInfoChange: (info: CollateralInfo) => void;
const reactTestGlobal = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

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
