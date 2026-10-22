/** @jest-environment jsdom */

import { act, createElement, useContext } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { LIVE_MESSAGE_LIMIT } from '../../../consts/api';
import {
  ExplorerBlockHeadsContext,
  ExplorerEventsContext,
  ExplorerEventsProvider,
  parseExplorerEvent,
  partitionExplorerDomains,
  shouldEnableExplorerEvents,
  withConfirmations,
} from './ExplorerEventsProvider';
import { useMessageRowSubscription } from './useLiveMessages';

const reactTestGlobal = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
beforeAll(() => {
  reactTestGlobal.IS_REACT_ACT_ENVIRONMENT = true;
});
afterAll(() => {
  delete reactTestGlobal.IS_REACT_ACT_ENVIRONMENT;
});

describe('Explorer websocket lifecycle', () => {
  const originalWebSocket = global.WebSocket;
  let sockets: FakeWebSocket[];
  let container: HTMLDivElement;
  let root: Root;
  const refresh = jest.fn();
  function Subscriber({ messageId = '0xmessage-id' }: { messageId?: string }) {
    const { messageRow } = useMessageRowSubscription(messageId, true, refresh);
    return createElement('div', null, messageRow?.msg_id ?? 'none');
  }
  async function render(
    children = createElement(EventState),
    props: { domains?: number[]; enabled?: boolean } = {},
  ) {
    await act(async () => root.render(createElement(ExplorerEventsProvider, props, children)));
  }
  function send(message: unknown, socket = sockets.at(-1)!) {
    socket.onmessage?.(new MessageEvent('message', { data: JSON.stringify(message) }));
  }
  async function emit(message: unknown, socket = sockets.at(-1)!) {
    await act(async () => send(message, socket));
  }
  beforeEach(() => {
    sockets = [];
    container = document.createElement('div');
    root = createRoot(container);
    refresh.mockClear();
    global.WebSocket = class extends FakeWebSocket {
      constructor(url: string) {
        super(url);
        sockets.push(this);
      }
    } as unknown as typeof WebSocket;
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    global.WebSocket = originalWebSocket;
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('connects only on routes consuming live messages', async () => {
    expect(shouldEnableExplorerEvents('/')).toBe(true);
    expect(shouldEnableExplorerEvents('/message/[messageId]')).toBe(true);
    expect(shouldEnableExplorerEvents('/404')).toBe(false);
    await render(undefined, { enabled: shouldEnableExplorerEvents('/tx/[txHash]') });
    expect(sockets).toHaveLength(0);
  });

  it('keeps canonical updates available before domains load', async () => {
    await render();
    expect(sockets[0].url).toBe('wss://explorer-api.hyperlane.xyz/messages?blocks=true');
  });

  it('refreshes on every rollback, including an empty overlay', async () => {
    await render(undefined, { domains: [1] });
    expect(sockets[0].url).toBe(
      'wss://explorer-api.hyperlane.xyz/messages?blocks=true&confirmations=0&domains=1',
    );
    await emit({ type: 'message_upsert', data: makeProxyMessage() });
    expect(container.textContent).toBe('1:0');
    for (const [index, domain] of [1, 173].entries()) {
      await emit({ type: 'rollback', confirmations: 0, domain, fromHeight: '100', toHeight: '99' });
      expect(container.textContent).toBe(`0:${index + 1}`);
    }
    expect(sockets[0].closed).toBe(false);
  });

  it('replays buffered rows on subscription and clears them on navigation', async () => {
    await render();
    await emit({ type: 'ready' });
    await emit({ type: 'message_upsert', data: makeProxyMessage() });
    await render(createElement(Subscriber));
    expect(container.textContent).toBe('\\xmessage-id');
    expect(refresh).not.toHaveBeenCalled();
    await render(createElement(Subscriber, { messageId: '0xother' }));
    expect(container.textContent).toBe('none');
    await emit({ type: 'message_upsert', data: makeProxyMessage() });
    expect(container.textContent).toBe('none');
  });

  it('retains subscribed rows through eviction and clears them on rollback', async () => {
    await render(createElement(Subscriber));
    await emit({ type: 'ready' });
    expect(refresh).toHaveBeenCalledTimes(1);
    await act(async () => {
      send({ type: 'message_upsert', data: makeProxyMessage() });
      for (let index = 0; index < LIVE_MESSAGE_LIMIT; index++) {
        send({
          type: 'message_upsert',
          data: { ...makeProxyMessage(), msg_id: `\\xother-${index}` },
        });
      }
    });
    expect(container.textContent).toBe('\\xmessage-id');
    await emit({
      type: 'rollback',
      confirmations: 0,
      domain: 173,
      fromHeight: '100',
      toHeight: '99',
    });
    expect(container.textContent).toBe('none');
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('clears disconnected rows, rejects stale frames, and refreshes after reconnecting', async () => {
    jest.useFakeTimers();
    await render(createElement(Subscriber));
    await emit({ type: 'ready' });
    await emit({ type: 'message_upsert', data: makeProxyMessage() });
    const previous = sockets[0];
    await act(async () => previous.close());
    expect(container.textContent).toBe('none');
    await emit({ type: 'ready' }, previous);
    await emit({ type: 'message_upsert', data: makeProxyMessage() }, previous);
    expect(refresh).toHaveBeenCalledTimes(1);
    await act(async () => jest.advanceTimersByTime(1000));
    expect(sockets).toHaveLength(2);
    await emit({ type: 'ready' });
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(container.textContent).toBe('none');
    // A delayed open from the old connection must not replace the active watchdog.
    await act(async () => previous.onopen?.(new Event('open')));
    await act(async () => jest.advanceTimersByTime(65000));
    expect(sockets[1].closed).toBe(true);
  });

  it('tolerates hidden tabs but reconnects when a visible heartbeat expires', async () => {
    jest.useFakeTimers();
    const visibility = jest.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    await render();
    await act(async () => jest.advanceTimersByTime(65000));
    expect(sockets[0].closed).toBe(false);
    visibility.mockReturnValue('visible');
    await act(async () => jest.advanceTimersByTime(65000));
    expect(sockets[0].closed).toBe(true);
    await act(async () => jest.advanceTimersByTime(1000));
    expect(sockets).toHaveLength(2);
    await act(async () => root.unmount());
    await act(async () => jest.advanceTimersByTime(130000));
    expect(sockets).toHaveLength(2);
  });

  it('updates block heads independently, permits reorgs, and clears on disconnect', async () => {
    function BlockState() {
      const heads = useContext(ExplorerBlockHeadsContext);
      return createElement('div', null, heads.get(1)?.headHeight ?? 'unknown');
    }
    await render(createElement(BlockState));
    for (const height of ['103', '104', '102']) {
      await emit({
        type: 'block',
        domain: 1,
        height,
        headHeight: height,
        hash: `0x${'ab'.repeat(32)}`,
      });
      expect(container.textContent).toBe(height);
    }
    await act(async () => sockets[0].close());
    expect(container.textContent).toBe('unknown');
  });
});

describe('parseExplorerEvent', () => {
  it('accepts exact block heights and rejects malformed blocks', () => {
    const block = {
      type: 'block',
      domain: 1,
      height: '103',
      headHeight: '105',
      hash: `0x${'ab'.repeat(32)}`,
    };
    expect(parseExplorerEvent(JSON.stringify(block))).toEqual(block);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    for (const invalid of [
      { domain: -1 },
      { height: '1.5' },
      { headHeight: '102' },
      { headHeight: '9007199254740993' },
      { hash: '0xabc' },
    ])
      expect(parseExplorerEvent(JSON.stringify({ ...block, ...invalid }))).toBeNull();
    warn.mockRestore();
  });
  it('accepts the proxy numeric-string ID format', () => {
    const data = makeProxyMessage();
    expect(parseExplorerEvent(JSON.stringify({ type: 'message_upsert', data }))).toEqual({
      type: 'message_upsert',
      data,
    });
  });

  it('accepts provisional upserts without transaction address enrichment', () => {
    const data = {
      ...makeProxyMessage(),
      origin_tx_recipient: null,
      origin_tx_sender: null,
    };
    expect(parseExplorerEvent(JSON.stringify({ type: 'message_upsert', data }))).toEqual({
      type: 'message_upsert',
      data,
    });
  });

  it('keeps confirmation state without retaining unused envelope fields', () => {
    const data = makeProxyMessage();
    expect(
      parseExplorerEvent(
        JSON.stringify({
          confirmations: 0,
          data,
          domain: 173,
          height: '100',
          type: 'message_upsert',
        }),
      ),
    ).toEqual({ confirmations: 0, data, type: 'message_upsert' });
  });

  it('rejects malformed message upserts', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(parseExplorerEvent(JSON.stringify({ type: 'message_upsert', data: {} }))).toBeNull();
    expect(
      parseExplorerEvent(JSON.stringify({ type: 'message_upsert', data: { msg_id: '\\xabc' } })),
    ).toBeNull();
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });

  it('accepts a zero-confirmation rollback', () => {
    const rollback = {
      type: 'rollback',
      confirmations: 0,
      domain: 1,
      fromHeight: '100',
      toHeight: '99',
    };
    expect(parseExplorerEvent(JSON.stringify(rollback))).toEqual(rollback);
  });

  it('rejects malformed rollback events', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(
      parseExplorerEvent(
        JSON.stringify({
          type: 'rollback',
          confirmations: 1,
          domain: 1,
          fromHeight: '100',
          toHeight: '99',
        }),
      ),
    ).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});

describe('withConfirmations', () => {
  it('requests the zero-confirmation frontier for every scraped domain', () => {
    expect(withConfirmations('wss://api.example/messages?token=abc', [1, 10, 42161])).toBe(
      'wss://api.example/messages?token=abc&blocks=true&confirmations=0&domains=1%2C10%2C42161',
    );
  });
});

describe('partitionExplorerDomains', () => {
  it('deduplicates valid signed-int domains and separates invalid values', () => {
    expect(partitionExplorerDomains([10, 1, 10, -1, 0x80000000, Number.NaN])).toEqual({
      domainIds: [1, 10],
      invalidDomainIds: [-1, 0x80000000, Number.NaN],
    });
  });
});

function makeProxyMessage() {
  return {
    id: '164316136',
    msg_id: '\\xmessage-id',
    nonce: 80498,
    sender: '\\xsender',
    recipient: '\\xrecipient',
    is_delivered: false,
    send_occurred_at: '2026-08-21 07:53:28',
    origin_domain_id: 173,
    origin_block_height: 100,
    origin_tx_hash: '\\xorigin-hash',
    origin_tx_sender: '\\xorigin-sender',
    origin_tx_recipient: '\\xorigin-recipient',
    destination_domain_id: 56,
  };
}

function EventState() {
  const context = useContext(ExplorerEventsContext);
  return createElement('div', null, `${context?.messageRows.length}:${context?.revision}`);
}

class FakeWebSocket {
  closed = false;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onopen: ((event: Event) => void) | null = null;

  constructor(readonly url: string) {}

  close() {
    this.closed = true;
    this.onclose?.(new CloseEvent('close'));
  }
}
