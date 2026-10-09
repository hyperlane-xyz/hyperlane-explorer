/** @jest-environment jsdom */

import { act, createElement, useContext } from 'react';
import { createRoot } from 'react-dom/client';

import {
  ExplorerEventsContext,
  ExplorerEventsProvider,
  parseExplorerEvent,
  shouldEnableExplorerEvents,
  withConfirmations,
} from './ExplorerEventsProvider';

const reactTestGlobal = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

beforeAll(() => {
  reactTestGlobal.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(() => {
  delete reactTestGlobal.IS_REACT_ACT_ENVIRONMENT;
});

describe('Explorer events routes', () => {
  it('enables live events only where messages consume them', () => {
    expect(shouldEnableExplorerEvents('/')).toBe(true);
    expect(shouldEnableExplorerEvents('/message/[messageId]')).toBe(true);
    expect(shouldEnableExplorerEvents('/tx/[txHash]')).toBe(false);
    expect(shouldEnableExplorerEvents('/404')).toBe(false);
  });

  it('does not construct a websocket on a transaction route', async () => {
    const originalWebSocket = global.WebSocket;
    const webSocketMock = jest.fn() as unknown as typeof WebSocket;
    global.WebSocket = webSocketMock;
    const container = document.createElement('div');
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(
          ExplorerEventsProvider,
          { enabled: shouldEnableExplorerEvents('/tx/[txHash]') },
          createElement('div'),
        ),
      );
    });

    expect(webSocketMock).not.toHaveBeenCalled();
    await act(async () => root.unmount());
    global.WebSocket = originalWebSocket;
  });

  it('connects at zero confirmations and clears provisional rows on rollback', async () => {
    const originalWebSocket = global.WebSocket;
    const sockets: FakeWebSocket[] = [];
    global.WebSocket = class extends FakeWebSocket {
      constructor(url: string) {
        super(url);
        sockets.push(this);
      }
    } as unknown as typeof WebSocket;
    const container = document.createElement('div');
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(ExplorerEventsProvider, { domains: [1] }, createElement(EventState)),
      );
    });
    expect(sockets).toHaveLength(1);
    expect(sockets[0].url).toBe(
      'wss://explorer-api.hyperlane.xyz/messages?confirmations=0&domains=1',
    );

    await act(async () => {
      sockets[0].onmessage?.({
        data: JSON.stringify({ data: makeProxyMessage(), type: 'message_upsert' }),
      } as MessageEvent);
    });
    expect(container.textContent).toBe('1:0');

    await act(async () => {
      sockets[0].onmessage?.({
        data: JSON.stringify({
          confirmations: 0,
          domain: 1,
          fromHeight: '100',
          toHeight: '99',
          type: 'rollback',
        }),
      } as MessageEvent);
    });
    expect(container.textContent).toBe('0:1');
    expect(sockets[0].closed).toBe(false);

    await act(async () => root.unmount());
    global.WebSocket = originalWebSocket;
  });
});

describe('parseExplorerEvent', () => {
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
      'wss://api.example/messages?token=abc&confirmations=0&domains=1%2C10%2C42161',
    );
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
    origin_tx_hash: '\\xorigin-hash',
    origin_tx_sender: '\\xorigin-sender',
    origin_tx_recipient: '\\xorigin-recipient',
    destination_domain_id: 56,
  };
}

function EventState() {
  const context = useContext(ExplorerEventsContext);
  return createElement('div', null, `${context?.messageRows.length}:${context?.rollbackVersion}`);
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
  }
}
