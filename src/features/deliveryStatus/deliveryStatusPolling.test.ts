import { useQuery } from '@tanstack/react-query';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { MessageStatus, type MessageStub } from '../../types';
import { getDeliveryStatusRefetchInterval } from './deliveryStatusPolling';
import { useMessageDeliveryStatus } from './useMessageDeliveryStatus';

jest.mock('@tanstack/react-query', () => ({
  useQuery: jest.fn(() => ({ error: null, isFetching: false })),
}));
jest.mock('../../store', () => ({
  useMultiProviderVersion: () => 1,
  useReadyMultiProvider: () => undefined,
  useRegistry: () => null,
  useStore: () => null,
}));
jest.mock('../chains/MissingChainConfigToast', () => ({ MissingChainConfigToast: () => null }));
jest.mock('../chains/utils', () => ({ isEvmChain: () => true }));
jest.mock('../messages/queries/useLiveMessages', () => ({ useIsMessageLive: () => false }));

it.each([
  [false, true, 'connected', 10_000],
  [false, false, 'connected', false],
  [false, false, 'connecting', 10_000],
  [false, false, 'disconnected', 10_000],
  [false, undefined, 'unavailable', 10_000],
  [true, true, 'connected', false],
  [true, false, 'disconnected', false],
] as const)(
  'delivery polling: delivered=%s, PI=%s, connection=%s',
  (delivered, pi, state, interval) => {
    expect(getDeliveryStatusRefetchInterval(delivered, pi, state)).toBe(interval);
  },
);

it('keeps the delivery RPC key stable when the websocket re-sends a message', () => {
  function Probe({ message }: { message: MessageStub }) {
    useMessageDeliveryStatus({ message, enabled: true });
    return null;
  }
  const message = {
    msgId: '0x01',
    status: MessageStatus.Pending,
    liveReceivedAt: 1,
  } as MessageStub;
  renderToStaticMarkup(createElement(Probe, { message }));
  renderToStaticMarkup(createElement(Probe, { message: { ...message, liveReceivedAt: 2 } }));
  const calls = jest.mocked(useQuery).mock.calls;
  expect(calls.at(-1)?.[0].queryKey).toEqual(calls.at(-2)?.[0].queryKey);
});
