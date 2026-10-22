/** @jest-environment jsdom */

import { act } from 'react';
import { createRoot } from 'react-dom/client';

import { MessageStatus, type MessageStub } from '../../types';
import { MessageTable } from './MessageTable';

jest.mock('@hyperlane-xyz/utils', () => ({
  isNullish: (value: unknown) => value == null,
  shortenAddress: (value: string) => value,
}));
jest.mock('next/router', () => ({ useRouter: () => ({}) }));
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('next/image', () => ({ __esModule: true, default: () => null }));
jest.mock('../../metadataStore', () => ({
  useChainMetadataResolver: () => ({ tryGetChainName: () => 'chain' }),
  useStore: () => ({}),
}));
jest.mock('../../components/icons/ChainLogo', () => ({ ChainLogo: () => null }));
jest.mock('../../components/icons/TokenIcon', () => ({ TokenIcon: () => null }));
jest.mock('../../utils/addresses', () => ({
  formatAddress: (value: string) => value,
  formatTxHash: (value: string) => value,
}));
jest.mock('../../utils/scheduleWhenIdle', () => ({ scheduleWhenIdle: () => () => {} }));
jest.mock('../../utils/time', () => ({
  getHumanReadableTimeString: () => 'now',
  getRelativeTimeRefreshInterval: () => null,
}));
jest.mock('../../utils/useVisibleInterval', () => ({ useVisibleInterval: () => {} }));
jest.mock('../chains/utils', () => ({ getChainDisplayName: () => 'chain' }));
jest.mock('./navigationPrefetch', () => ({ prefetchMessageDetailShell: jest.fn() }));
jest.mock('./queries/prefetch', () => ({ prefetchMessageStub: jest.fn() }));
jest.mock('./utils', () => ({
  parseWarpRouteMessageDetails: () => null,
  serializeMessage: () => undefined,
}));

it('does not flash on database ID handoff and highlights observed provisional delivery', async () => {
  const testGlobal = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  testGlobal.IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div');
  const root = createRoot(container);
  const message: MessageStub = {
    id: '1',
    msgId: '0x01',
    nonce: 0,
    sender: '0x11',
    recipient: '0x22',
    originChainId: 1,
    destinationChainId: 10,
    originDomainId: 1,
    destinationDomainId: 10,
    origin: { hash: '0x33', timestamp: 1 },
    body: '0x',
    status: MessageStatus.Pending,
  };
  const render = (next: MessageStub) =>
    act(async () => root.render(<MessageTable messageList={[next]} isFetching={false} />));
  try {
    await render(message);
    await render({ ...message, id: '100' });
    expect(container.querySelector('tbody tr')?.className).not.toContain(
      'animate-live-message-insert',
    );
    await render({ ...message, id: '100', status: MessageStatus.Delivered, isProvisional: true });
    expect(container.querySelector('tbody tr')?.className).toContain('bg-green-25');
    expect(container.querySelector('tbody tr')?.className).not.toContain(
      'animate-live-message-insert',
    );
  } finally {
    await act(async () => root.unmount());
    delete testGlobal.IS_REACT_ACT_ENVIRONMENT;
  }
});
