import type { NextRequest } from 'next/server';

import handler from '../../../pages/api/og';
import { fetchChainMetadata, fetchWarpRouteMap } from '../../../utils/yamlParsing';
import { fetchDomainNames, fetchMessageForOG } from './serverFetch';

jest.mock('@vercel/og', () => ({ ImageResponse: jest.fn() }));
jest.mock('./serverFetch', () => ({
  ...jest.requireActual('./serverFetch'),
  fetchDomainNames: jest.fn(),
  fetchMessageForOG: jest.fn(),
}));
jest.mock('../../../utils/colorExtraction', () => ({
  ...jest.requireActual('../../../utils/colorExtraction'),
  extractChainColors: jest.fn(),
}));
jest.mock('../../../utils/yamlParsing', () => ({
  ...jest.requireActual('../../../utils/yamlParsing'),
  fetchChainMetadata: jest.fn(),
  fetchWarpRouteMap: jest.fn(),
}));

const message = {
  msgId: `0x${'ab'.repeat(32)}`,
  originDomainId: 1,
  destinationDomainId: 42161,
  timestamp: 1_700_000_000_000,
  isDelivered: false,
  sender: `0x${'12'.repeat(32)}`,
  deliveryLatency: null,
};

function request(messageId: string): NextRequest {
  return new Request(`https://example.com/api/og?messageId=${messageId}`) as NextRequest;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(new Uint8Array([0])));
  jest.mocked(fetchDomainNames).mockResolvedValue(new Map());
  jest.mocked(fetchChainMetadata).mockResolvedValue(new Map());
  jest.mocked(fetchWarpRouteMap).mockResolvedValue(new Map());
});

afterEach(() => jest.restoreAllMocks());

it('skips auxiliary lookups for an invalid message ID', async () => {
  await handler(request('invalid'));

  expect(fetchMessageForOG).not.toHaveBeenCalled();
  expect(fetchDomainNames).not.toHaveBeenCalled();
  expect(fetchChainMetadata).not.toHaveBeenCalled();
  expect(fetchWarpRouteMap).not.toHaveBeenCalled();
});

it('skips the Warp registry for a message with no indexed row', async () => {
  jest.mocked(fetchMessageForOG).mockResolvedValue(null);

  await handler(request(message.msgId));

  expect(fetchWarpRouteMap).not.toHaveBeenCalled();
});

it.each([
  [null, 0],
  [`0x${'00'.repeat(63)}`, 0],
  [`0x${'00'.repeat(64)}`, 1],
])('loads the Warp registry only for a body with an amount word (%s)', async (body, reads) => {
  jest.mocked(fetchMessageForOG).mockResolvedValue({ ...message, body });

  await handler(request(message.msgId));

  expect(fetchWarpRouteMap).toHaveBeenCalledTimes(reads);
});
