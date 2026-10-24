import type { NextApiRequest, NextApiResponse } from 'next';

import handler from '../../pages/api/og-video';
import { logger } from '../../utils/logger';
import { renderMessageVideo } from './renderMessageVideo';

jest.mock('./renderMessageVideo', () => ({ renderMessageVideo: jest.fn() }));
const render = jest.mocked(renderMessageVideo);
let sequence = 0;
const id = () => '0x' + (++sequence).toString(16).padStart(64, '0');

function response() {
  const headers = new Map<string, string | number | readonly string[]>();
  const result = { code: 200, body: undefined as Buffer | string | undefined };
  const res = {
    setHeader: jest.fn((key, value) => {
      headers.set(key, value);
      return res;
    }),
    status: jest.fn((code) => {
      result.code = code;
      return res;
    }),
    end: jest.fn((body?: Buffer | string) => {
      result.body = body;
      return res;
    }),
  };
  return { res: res as unknown as NextApiResponse, headers, result };
}
function request(messageId: string, method = 'GET', range?: string) {
  return { method, query: { messageId }, headers: { range } } as unknown as NextApiRequest;
}

beforeEach(() => {
  render.mockReset();
  render.mockResolvedValue(Buffer.from('0123456789'));
});
afterEach(() => jest.restoreAllMocks());

describe('message OG video endpoint', () => {
  it('rejects invalid IDs and unsupported methods before rendering', async () => {
    const invalid = response();
    await handler(request('not-a-message'), invalid.res);
    expect(invalid.result.code).toBe(400);
    const post = response();
    await handler(request(id(), 'POST'), post.res);
    expect(post.result.code).toBe(405);
    expect(post.headers.get('Allow')).toBe('GET, HEAD');
    expect(render).not.toHaveBeenCalled();
  });

  it.each([
    ['bytes=0-3', 206, '0123', 'bytes 0-3/10'],
    ['bytes=4-', 206, '456789', 'bytes 4-9/10'],
    ['bytes=-4', 206, '6789', 'bytes 6-9/10'],
    ['bytes=-100', 206, '0123456789', 'bytes 0-9/10'],
    ['bytes=99-', 416, undefined, 'bytes */10'],
    ['nonsense', 200, '0123456789', undefined],
    ['items=0-3', 200, '0123456789', undefined],
    ['items=99-', 200, '0123456789', undefined],
  ])('serves range %s correctly', async (range, code, body, contentRange) => {
    const res = response();
    await handler(request(id(), 'GET', range), res.res);
    expect(res.result.code).toBe(code);
    expect(res.result.body?.toString()).toBe(body);
    expect(res.headers.get('Content-Range')).toBe(contentRange);
    expect(res.headers.get('Content-Type')).toBe('video/mp4');
  });

  it('serves HEAD metadata without a response body', async () => {
    const res = response();
    await handler(request(id(), 'HEAD'), res.res);
    expect(res.result.code).toBe(200);
    expect(res.result.body).toBeUndefined();
    expect(res.headers.get('Content-Length')).toBe(10);
  });

  it('coalesces requests and expires cached pending videos so delivery can update', async () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(1000);
    const messageId = id();
    const a = response();
    const b = response();
    await Promise.all([
      handler(request(messageId), a.res),
      handler(request(messageId.toUpperCase()), b.res),
    ]);
    expect(render).toHaveBeenCalledTimes(1);
    const cached = response();
    await handler(request(messageId), cached.res);
    expect(render).toHaveBeenCalledTimes(1);
    now.mockReturnValue(61_001);
    render.mockResolvedValue(Buffer.from('delivered'));
    const refreshed = response();
    await handler(request(messageId), refreshed.res);
    expect(render).toHaveBeenCalledTimes(2);
    expect(refreshed.result.body?.toString()).toBe('delivered');
  });

  it('keeps renderer failures retryable rather than caching a broken video', async () => {
    jest.spyOn(logger, 'error').mockImplementation(() => {});
    const messageId = id();
    render.mockRejectedValueOnce(new Error('encoder timeout'));
    const failed = response();
    await handler(request(messageId), failed.res);
    expect(failed.result.code).toBe(503);
    expect(failed.headers.get('Cache-Control')).toBe('no-store');
    const retry = response();
    await handler(request(messageId), retry.res);
    expect(retry.result.code).toBe(200);
    expect(render).toHaveBeenCalledTimes(2);
  });

  it('returns an uncached 404 when no indexed message is available', async () => {
    render.mockResolvedValue(null);
    const res = response();
    await handler(request(id()), res.res);
    expect(res.result.code).toBe(404);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('bounds concurrent encoders while allowing an existing render to finish', async () => {
    let complete: ((value: Buffer) => void) | undefined;
    const pending = new Promise<Buffer>((resolve) => {
      complete = resolve;
    });
    render.mockReturnValue(pending);
    const a = response();
    const b = response();
    const busy = response();
    const running = [handler(request(id()), a.res), handler(request(id()), b.res)];
    await handler(request(id()), busy.res);
    expect(busy.result.code).toBe(503);
    expect(busy.headers.get('Retry-After')).toBe('5');
    complete!(Buffer.from('done'));
    await Promise.all(running);
    expect(a.result.code).toBe(200);
    expect(b.result.code).toBe(200);
  });
});
