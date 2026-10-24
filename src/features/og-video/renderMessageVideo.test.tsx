import { ImageResponse } from '@vercel/og';
import { isValidElement } from 'react';

import { fetchChainMetadata, fetchWarpRouteMap } from '../../utils/yamlParsing';
import {
  fetchDomainNames,
  fetchMessageForOG,
  type MessageOGData,
} from '../messages/queries/serverFetch';
import { encodeVideo } from './encodeVideo';
import type { VideoMessage } from './MessageVideoCard';
import { renderMessageVideo } from './renderMessageVideo';

jest.mock('../messages/queries/serverFetch', () => ({
  fetchMessageForOG: jest.fn(),
  fetchDomainNames: jest.fn(),
}));
jest.mock('../../utils/yamlParsing', () => ({
  ...jest.requireActual<typeof import('../../utils/yamlParsing')>('../../utils/yamlParsing'),
  fetchChainMetadata: jest.fn(),
  fetchWarpRouteMap: jest.fn(),
}));
jest.mock('./encodeVideo', () => ({ encodeVideo: jest.fn() }));
jest.mock('@vercel/og', () => ({
  ImageResponse: jest.fn().mockImplementation(() => ({
    arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
  })),
}));

const message: MessageOGData = {
  msgId: '0x' + '12'.repeat(32),
  status: 'Delivered',
  originDomainId: 8453,
  destinationDomainId: 1,
  originTxHash: '0x' + 'ab'.repeat(32),
  timestamp: 1000,
  sender: '0x1234',
  recipient: '0x5678',
  body: null,
  deliveryLatency: '00:00:42',
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(fetchMessageForOG).mockResolvedValue(message);
  jest.mocked(fetchDomainNames).mockResolvedValue(
    new Map([
      [8453, 'base'],
      [1, 'ethereum'],
    ]),
  );
  jest.mocked(fetchChainMetadata).mockResolvedValue(
    new Map([
      ['base', { displayName: 'Base' }],
      ['ethereum', { displayName: 'Ethereum' }],
    ]),
  );
  jest.mocked(fetchWarpRouteMap).mockResolvedValue(new Map());
  jest.mocked(encodeVideo).mockResolvedValue(Buffer.from('video'));
  jest
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async () => new Response('<svg/>', { status: 200 }));
});
afterEach(() => jest.restoreAllMocks());

function keyframes() {
  return jest
    .mocked(ImageResponse)
    .mock.calls.slice(0, 2)
    .map(([element]) => {
      if (!isValidElement<{ message: VideoMessage; time: number; showPacket: boolean }>(element)) {
        throw new Error('Expected a message card keyframe');
      }
      return element.props;
    });
}

describe('message video data', () => {
  it('feeds the indexed message and registry labels into the video keyframes', async () => {
    const result = await renderMessageVideo(message.msgId);
    expect(result?.toString()).toBe('video');
    const [first, last] = keyframes();
    expect(first.message.origin.name).toBe('Base');
    expect(first.message.destination.name).toBe('Ethereum');
    expect(first.message.msgId).toBe(message.msgId);
    expect(first.message.deliveryLatency).toBe('00:00:42');
    expect(first.message.transfer).toBeNull();
    expect(first.time).toBe(0);
    expect(last.time).toBe(5);
    expect(first.showPacket).toBe(false);
    expect(encodeVideo).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'delivered' }),
      expect.any(Number),
    );
  });

  it('keeps both pending keyframes before receipt', async () => {
    jest
      .mocked(fetchMessageForOG)
      .mockResolvedValue({ ...message, status: 'Pending', deliveryLatency: null });
    await renderMessageVideo(message.msgId);
    expect(keyframes().map((frame) => frame.time)).toEqual([0, 0]);
    expect(encodeVideo).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'pending' }),
      expect.any(Number),
    );
  });

  it('does not encode an invented message when the indexer has no result', async () => {
    jest.mocked(fetchMessageForOG).mockResolvedValue(null);
    expect(await renderMessageVideo(message.msgId)).toBeNull();
    expect(encodeVideo).not.toHaveBeenCalled();
  });
});
