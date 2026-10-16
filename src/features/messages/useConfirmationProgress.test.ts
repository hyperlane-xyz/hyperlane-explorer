/** @jest-environment jsdom */

import { TextDecoder, TextEncoder } from 'util';

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';

import { MessageStatus, type MessageStub } from '../../types';
import { ExplorerBlockHeadsContext, type ExplorerBlock } from './queries/ExplorerEventsProvider';
import {
  calculateConfirmationCount,
  isWaitingForOriginConfirmations,
  getRequiredConfirmations,
  useConfirmationProgress,
} from './useConfirmationProgress';

it('advances only from streamed origin heads and returns to confirming after a reorg', async () => {
  // SDK imports require encoding globals absent from jsdom.
  const fetch = jest.fn(() => {
    throw new Error('Unexpected RPC polling');
  });
  Object.assign(globalThis, { TextDecoder, TextEncoder, fetch });
  const { createChainMetadataResolver } =
    await import('@hyperlane-xyz/sdk/metadata/ChainMetadataResolver');
  const { ProtocolType } = await import('@hyperlane-xyz/utils');
  const resolver = createChainMetadataResolver({
    ethereum: {
      name: 'ethereum',
      chainId: 1,
      protocol: ProtocolType.Ethereum,
      rpcUrls: [{ http: 'https://unused.example' }],
      blocks: { confirmations: 2, reorgPeriod: 15 },
    },
  });
  const message: MessageStub = {
    id: '1',
    msgId: '0x01',
    nonce: 1,
    sender: '0x01',
    recipient: '0x02',
    body: '0x',
    status: MessageStatus.Pending,
    isProvisional: true,
    originChainId: 1,
    originDomainId: 1,
    destinationChainId: 2,
    destinationDomainId: 2,
    origin: { blockNumber: 100, timestamp: 0, hash: '0x01' },
  };
  function Progress() {
    const progress = useConfirmationProgress(message, resolver);
    return createElement(
      'div',
      null,
      `${isWaitingForOriginConfirmations(message, progress) ? 'confirming' : 'pending'}:${progress?.current ?? '?'} / ${progress?.required}`,
    );
  }
  const container = document.createElement('div');
  const root = createRoot(container);
  const testGlobal: typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean } = globalThis;
  testGlobal.IS_REACT_ACT_ENVIRONMENT = true;
  const heads = new Map<number, ExplorerBlock>();
  async function render() {
    await act(async () =>
      root.render(
        createElement(
          ExplorerBlockHeadsContext.Provider,
          { value: new Map(heads) },
          createElement(Progress),
        ),
      ),
    );
  }
  function head(domain: number, height: number) {
    heads.set(domain, {
      type: 'block',
      domain,
      height: String(height),
      headHeight: String(height),
      hash: `0x${'01'.repeat(32)}`,
    });
  }
  try {
    await render();
    expect(container.textContent).toBe('confirming:? / 15');
    head(2, 200);
    await render();
    expect(container.textContent).toBe('confirming:? / 15');
    head(1, 103);
    await render();
    expect(container.textContent).toBe('confirming:3 / 15');
    head(1, 115);
    await render();
    expect(container.textContent).toBe('pending:15 / 15');
    head(1, 114);
    await render();
    expect(container.textContent).toBe('confirming:14 / 15');
    heads.clear();
    await render();
    expect(container.textContent).toBe('confirming:? / 15');
    expect(fetch).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    delete testGlobal.IS_REACT_ACT_ENVIRONMENT;
  }
});

describe('calculateConfirmationCount', () => {
  it('tracks blocks after inclusion and caps at the required confirmations', () => {
    expect(calculateConfirmationCount(100, 100, 5)).toBe(0);
    expect(calculateConfirmationCount(100, 103, 5)).toBe(3);
    expect(calculateConfirmationCount(100, 110, 5)).toBe(5);
  });

  it('does not report a negative or unknown head', () => {
    expect(calculateConfirmationCount(100, 99, 5)).toBe(0);
    expect(calculateConfirmationCount(100, undefined, 5)).toBeNull();
    expect(calculateConfirmationCount(undefined, 105, 5)).toBeNull();
    expect(calculateConfirmationCount(undefined, undefined, 0)).toBe(0);
  });
});

describe('isWaitingForOriginConfirmations', () => {
  const pending = { isProvisional: true, status: MessageStatus.Pending };

  it('keeps an unknown head confirming and moves to pending at the threshold', () => {
    expect(isWaitingForOriginConfirmations(pending, { current: null, required: 15 })).toBe(true);
    expect(isWaitingForOriginConfirmations(pending, { current: 14, required: 15 })).toBe(true);
    expect(isWaitingForOriginConfirmations(pending, { current: 15, required: 15 })).toBe(false);
    expect(isWaitingForOriginConfirmations(pending, { current: 0, required: 0 })).toBe(false);
  });

  it('does not hold delivered or canonical messages for confirmations', () => {
    expect(isWaitingForOriginConfirmations({ ...pending, status: MessageStatus.Delivered })).toBe(
      false,
    );
    expect(isWaitingForOriginConfirmations({ ...pending, isProvisional: false })).toBe(false);
  });
});

describe('getRequiredConfirmations', () => {
  it('uses the reorg-safe threshold when it is numeric', () => {
    expect(getRequiredConfirmations({ confirmations: 2, reorgPeriod: 15 })).toBe(15);
  });

  it('treats finalized chains as immediately final', () => {
    expect(getRequiredConfirmations({ confirmations: 2, reorgPeriod: 'finalized' })).toBe(0);
  });

  it('does not invent a block count for other block tags', () => {
    expect(getRequiredConfirmations({ confirmations: 2, reorgPeriod: 'safe' })).toBeUndefined();
  });

  it('falls back to transaction confirmations without a reorg period', () => {
    expect(getRequiredConfirmations({ confirmations: 2 })).toBe(2);
  });
});
