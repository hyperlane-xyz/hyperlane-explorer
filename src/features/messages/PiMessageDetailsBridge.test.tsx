/** @jest-environment jsdom */

import type { ParsedUrlQuery } from 'querystring';

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { Message, MessageStatus } from '../../types';
import { usePiChainMessageQuery } from './pi-queries/usePiChainMessageQuery';
import { PiMessageDetailsBridge } from './PiMessageDetailsBridge';

jest.mock('next/router', () => ({ useRouter: () => ({ query: mockQuery }) }));
jest.mock('@hyperlane-xyz/utils', () => ({
  fromBase64: (value: string) => JSON.parse(atob(value)),
}));
jest.mock('./pi-queries/usePiChainMessageQuery', () => ({ usePiChainMessageQuery: jest.fn() }));

const messageId = `0x${'ab'.repeat(32)}`;
const hash = `0x${'cd'.repeat(32)}`;
const forgedData = btoa(
  JSON.stringify({
    originDomainId: 1,
    origin: { hash, blockNumber: 123, mailbox: 'untrusted mailbox' },
    msgId: `0x${'ef'.repeat(32)}`,
    status: MessageStatus.Delivered,
    destination: { blockNumber: 456 },
    body: '0xdeadbeef',
  }),
);
let mockQuery: ParsedUrlQuery;
const query = jest.mocked(usePiChainMessageQuery);
const onStateChange = jest.fn();
let root: Root;

beforeAll(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
});
afterAll(() => {
  Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
});
beforeEach(() => {
  mockQuery = { messageId, data: forgedData };
  onStateChange.mockReset();
  query.mockReset();
  query.mockReturnValue({
    hasRun: true,
    isError: false,
    isFetching: false,
    isMessageFound: false,
    message: null,
  });
  root = createRoot(document.createElement('div'));
});
afterEach(async () => {
  await act(async () => root.unmount());
});

async function render() {
  await act(async () => {
    root.render(<PiMessageDetailsBridge messageId={messageId} onStateChange={onStateChange} />);
  });
}

it('uses only URL hints and never publishes the forged payload as a found message', async () => {
  await render();
  expect(query).toHaveBeenLastCalledWith({
    messageId,
    lookupData: { originDomainId: 1, origin: { hash } },
    pause: false,
  });
  expect(onStateChange).toHaveBeenLastCalledWith({
    hasRun: true,
    isError: false,
    isFetching: false,
    isMessageFound: false,
    message: null,
  });
});

it('publishes only the lookup result when chain data disagrees with URL fields', async () => {
  const verifiedMessage = {
    msgId: messageId,
    body: '0x1234',
    status: MessageStatus.Unknown,
  } as Message;
  query.mockReturnValue({
    hasRun: true,
    isError: false,
    isFetching: false,
    isMessageFound: true,
    message: verifiedMessage,
  });
  await render();
  expect(onStateChange).toHaveBeenLastCalledWith(
    expect.objectContaining({ message: verifiedMessage, isMessageFound: true }),
  );
});

it('ignores ambiguous repeated data parameters', async () => {
  mockQuery.data = [forgedData, forgedData];
  await render();
  expect(query).toHaveBeenLastCalledWith({ messageId, lookupData: undefined, pause: false });
});
