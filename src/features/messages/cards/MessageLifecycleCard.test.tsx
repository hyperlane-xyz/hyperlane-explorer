/** @jest-environment jsdom */
import { act, Profiler } from 'react';
import { createRoot } from 'react-dom/client';

import { MessageStatus, type MessageStub } from '../../../types';
import { createExplorerStream, ExplorerStreamContext } from '../queries/ExplorerEventsProvider';
import { MessageLifecycleCard } from './MessageLifecycleCard';

jest.mock('@hyperlane-xyz/widgets', () => ({ SpinnerIcon: () => null }));
jest.mock('../../../metadataStore', () => ({
  useChainMetadataResolver: () => ({
    tryGetChainMetadata: () => ({ blocks: { confirmations: 5 } }),
  }),
}));
jest.mock('../diagnostics/MessageDiagnosticsContext', () => ({
  useMessageDiagnosticsContext: () => ({ activities: [], connectionState: 'live' }),
}));

const message: MessageStub = {
  status: MessageStatus.Delivered,
  id: '1',
  msgId: '0xmessage',
  nonce: 0,
  sender: '0xsender',
  recipient: '0xrecipient',
  originChainId: 1,
  originDomainId: 1,
  destinationChainId: 10,
  destinationDomainId: 10,
  origin: { hash: '0xdispatch', blockNumber: 100, timestamp: 1_000 },
  destination: { hash: '0xdelivery', blockNumber: 200, timestamp: 2_000 },
  body: '0x',
};

it('avoids destination head commits past the displayed confirmation count and reacts to rollback', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const stream = createExplorerStream();
  const container = document.createElement('div');
  const root = createRoot(container);
  const onRender = jest.fn();
  const setHeight = (height: number) =>
    stream.setState({
      blockHeads: {
        10: { type: 'block', domain: 10, height: `${height}`, headHeight: `${height}`, hash: '0x' },
      },
    });
  const progress = () => container.querySelector('[data-testid="progress-status"]')?.textContent;

  try {
    setHeight(200);
    await act(async () =>
      root.render(
        <Profiler id="destination-confirmation" onRender={onRender}>
          <ExplorerStreamContext.Provider value={stream}>
            <MessageLifecycleCard message={message} confirmed={false} />
          </ExplorerStreamContext.Provider>
        </Profiler>,
      ),
    );
    onRender.mockClear();
    for (let height = 201; height <= 300; height++) {
      await act(async () => setHeight(height));
    }
    expect(progress()).toBe('Destination confirmations · 5 / 5');
    await act(async () => setHeight(203));
    expect(progress()).toBe('Destination confirmations · 3 / 5');
    expect(onRender).toHaveBeenCalledTimes(6);
  } finally {
    await act(async () => root.unmount());
    Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  }
});
