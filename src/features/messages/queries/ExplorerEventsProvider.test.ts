/** @jest-environment jsdom */

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';

import {
  ExplorerEventsProvider,
  parseExplorerEvent,
  shouldEnableExplorerEvents,
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
});

describe('parseExplorerEvent', () => {
  it('rejects malformed message upserts', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(parseExplorerEvent(JSON.stringify({ type: 'message_upsert', data: {} }))).toBeNull();
    expect(
      parseExplorerEvent(JSON.stringify({ type: 'message_upsert', data: { msg_id: '\\xabc' } })),
    ).toBeNull();
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });
});
/** @jest-environment jsdom */
