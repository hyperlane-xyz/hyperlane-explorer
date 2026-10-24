import type { NextApiRequest, NextApiResponse } from 'next';
import parseRange from 'range-parser';

import { renderMessageVideo } from '../../features/og-video/renderMessageVideo';
import { logger } from '../../utils/logger';

export const config = { maxDuration: 30, api: { responseLimit: '2mb' } };

const cache = new Map<string, { video: Buffer; expires: number }>();
const inFlight = new Map<string, Promise<Buffer | null>>();

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).end();
  }
  const { messageId } = req.query;
  if (typeof messageId !== 'string' || !/^0x[0-9a-f]{64}$/i.test(messageId)) {
    return res.status(400).end('Invalid message ID');
  }
  const key = messageId.toLowerCase();
  let video = cache.get(key);
  if (!video || video.expires <= Date.now()) {
    let request = inFlight.get(key);
    if (!request) {
      // Bound native encoders per instance, and coalesce requests for the same ID.
      if (inFlight.size >= 2) {
        res.setHeader('Retry-After', '5');
        return res.status(503).end('Video renderer busy');
      }
      request = renderMessageVideo(key);
      inFlight.set(key, request);
    }
    try {
      const data = await request;
      if (!data) return res.status(404).end('Message not found');
      video = { video: data, expires: Date.now() + 60_000 };
      if (cache.size >= 16) {
        const oldest = cache.keys().next().value;
        if (oldest !== undefined) cache.delete(oldest);
      }
      cache.set(key, video);
    } catch (error) {
      logger.error('Failed to render message OG video', error);
      return res.status(503).end('Video temporarily unavailable');
    } finally {
      inFlight.delete(key);
    }
  }
  const data = video.video;
  res.setHeader('Content-Type', 'video/mp4');
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60');
  const header = req.headers.range;
  const suffix = header?.match(/^bytes=-(\d+)$/);
  // A suffix larger than the file means the entire file, rather than an unsatisfiable range.
  const range = suffix && BigInt(suffix[1]) > BigInt(data.length) ? 'bytes=0-' : header;
  const ranges = range?.startsWith('bytes=')
    ? parseRange(data.length, range, { combine: true })
    : undefined;
  if (ranges === -1) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Range', `bytes */${data.length}`);
    return res.status(416).end();
  }
  if (ranges && typeof ranges !== 'number' && ranges.type === 'bytes' && ranges.length === 1) {
    const { start, end } = ranges[0];
    res.setHeader('Content-Range', `bytes ${start}-${end}/${data.length}`);
    res.setHeader('Content-Length', end - start + 1);
    return res.status(206).end(req.method === 'HEAD' ? undefined : data.subarray(start, end + 1));
  }
  // Unsupported/malformed Range headers may be ignored and receive the full response.
  res.setHeader('Content-Length', data.length);
  return res.status(200).end(req.method === 'HEAD' ? undefined : data);
}
