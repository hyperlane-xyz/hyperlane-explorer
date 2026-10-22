import { useQuery } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';

import { MessageStatus, type MessageStub } from '../../types';
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

it('does not change the RPC query key when a live row is re-sent', () => {
  function Probe({ message }: { message: MessageStub }) {
    useMessageDeliveryStatus({ message, enabled: true });
    return null;
  }
  const message = {
    msgId: '0x01',
    status: MessageStatus.Pending,
    liveReceivedAt: 1,
  } as MessageStub;
  renderToStaticMarkup(<Probe message={message} />);
  renderToStaticMarkup(<Probe message={{ ...message, liveReceivedAt: 2 }} />);
  const calls = jest.mocked(useQuery).mock.calls;
  expect(calls.at(-1)?.[0].queryKey).toEqual(calls.at(-2)?.[0].queryKey);
  const interval = calls.at(-1)?.[0].refetchInterval;
  expect(typeof interval === 'function' && interval({ state: {} } as never)).toBe(10_000);
});
