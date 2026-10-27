/** @jest-environment jsdom */

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { useQuery } from 'urql';

import { Message, MessageStatus } from '../../types';
import { useVisibleInterval } from '../../utils/useVisibleInterval';
import { buildMessageQuery } from '../messages/queries/build';
import { parseMessageQueryResult } from '../messages/queries/parse';
import { useTransactionMessagesQuery } from './useTransactionMessagesQuery';

jest.mock('urql', () => ({ useQuery: jest.fn() }));
jest.mock('../../metadataStore', () => ({ useChainMetadataResolver: () => ({}) }));
jest.mock('../../utils/useVisibleInterval', () => ({ useVisibleInterval: jest.fn() }));
jest.mock('../chains/queries/useScrapedChains', () => ({
  useScrapedDomains: () => ({ scrapedDomains: [] }),
}));
jest.mock('../messages/queries/build', () => ({
  MessageIdentifierType: { OriginTxHash: 'origin-tx-hash' },
  buildMessageQuery: jest.fn(() => ({ query: 'query', variables: {} })),
}));
jest.mock('../messages/queries/parse', () => ({ parseMessageQueryResult: jest.fn() }));

const mockUseQuery = jest.mocked(useQuery);
const mockParse = jest.mocked(parseMessageQueryResult);
const mockUseVisibleInterval = jest.mocked(useVisibleInterval);
const reexecuteQuery = jest.fn();

const deliveredMessage = {
  nonce: 1,
  status: MessageStatus.Delivered,
  destination: { hash: '0x1' },
} as Message;

const reactTestGlobal = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

beforeAll(() => {
  reactTestGlobal.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(() => {
  delete reactTestGlobal.IS_REACT_ACT_ENVIRONMENT;
});

beforeEach(() => {
  jest.clearAllMocks();
  mockUseQuery.mockReturnValue([
    {
      data: {},
      fetching: false,
      error: undefined,
      stale: false,
      hasNext: false,
      operation: undefined,
    },
    reexecuteQuery,
  ] as unknown as ReturnType<typeof useQuery>);
});

async function renderAndPoll(messages: Message[]) {
  mockParse.mockReturnValue(messages);
  function Probe() {
    useTransactionMessagesQuery(`0x${'a'.repeat(64)}`);
    return null;
  }
  const root = createRoot(document.createElement('div'));
  await act(async () => root.render(createElement(Probe)));
  const poll = mockUseVisibleInterval.mock.calls.at(-1)?.[0];
  poll?.();
  await act(async () => root.unmount());
}

it('includes unconfirmed dispatches in the tx query', async () => {
  await renderAndPoll([deliveredMessage]);
  expect(jest.mocked(buildMessageQuery)).toHaveBeenCalledWith(
    'origin-tx-hash',
    `0x${'a'.repeat(64)}`,
    expect.any(Number),
    false,
    'nonce: asc',
    { provisional: true },
  );
});

it('stops polling once every message is delivered and confirmed', async () => {
  await renderAndPoll([deliveredMessage]);
  expect(reexecuteQuery).not.toHaveBeenCalled();
});

it('keeps polling while a delivered message is still provisional', async () => {
  await renderAndPoll([{ ...deliveredMessage, isProvisional: true }]);
  expect(reexecuteQuery).toHaveBeenCalledWith({ requestPolicy: 'network-only' });
});
