/** @jest-environment jsdom */
import type { ChainMetadataResolver } from '@hyperlane-xyz/sdk/metadata/ChainMetadataResolver';
import { act, Profiler } from 'react';
import { createRoot } from 'react-dom/client';

import { MessageStatus, type MessageStub } from '../../../types';
import { createExplorerStream, ExplorerStreamContext } from '../queries/ExplorerEventsProvider';
import { useOriginConfirmation } from './useOriginConfirmation';

const metadata = {
  tryGetChainMetadata: () => ({ blocks: { confirmations: 5 } }),
} as unknown as ChainMetadataResolver;

const message: MessageStub = {
  status: MessageStatus.Pending,
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
  body: '0x',
};

function ConfirmationProbe({ value }: { value: MessageStub }) {
  const { current, confirmed } = useOriginConfirmation(value, metadata);
  return <output>{`${current}/${confirmed}`}</output>;
}

it.each([true, false, undefined])(
  'only commits origin head updates that change visible progress (canonical provisional: %s)',
  async (isOriginProvisional) => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const stream = createExplorerStream();
    const container = document.createElement('div');
    const root = createRoot(container);
    const onRender = jest.fn();
    const setHeight = (height: number) =>
      stream.setState({
        blockHeads: {
          1: { type: 'block', domain: 1, height: `${height}`, headHeight: `${height}`, hash: '0x' },
        },
      });

    try {
      setHeight(100);
      await act(async () =>
        root.render(
          <Profiler id="origin-confirmation" onRender={onRender}>
            <ExplorerStreamContext.Provider value={stream}>
              <ConfirmationProbe value={{ ...message, isOriginProvisional }} />
            </ExplorerStreamContext.Provider>
          </Profiler>,
        ),
      );
      onRender.mockClear();
      for (let height = 101; height <= 200; height++) {
        await act(async () => setHeight(height));
      }
      expect(container.textContent).toBe(`5/${isOriginProvisional !== true}`);
      // A rollback must still lower progress when the stream supplies maturity evidence.
      await act(async () => setHeight(103));
      expect(container.textContent).toBe(isOriginProvisional === false ? '5/true' : '3/false');
      expect(onRender).toHaveBeenCalledTimes(isOriginProvisional === false ? 0 : 6);
    } finally {
      await act(async () => root.unmount());
      Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
    }
  },
);
