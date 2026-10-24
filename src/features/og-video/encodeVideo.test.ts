import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { encodeVideo } from './encodeVideo';

// Exercise the packaged encoder and real filters, including both delivery states.
// This catches native-binary/codec failures that a mocked execFile cannot detect.
describe('OG video encoding', () => {
  it.each(['home', 'delivered', 'pending'] as const)(
    'encodes a downloadable %s MP4 with fast-start metadata',
    async (kind) => {
      const first = await readFile(join(process.cwd(), 'public/images/og-preview.png'));
      const packet = await readFile(join(process.cwd(), 'public/favicon-32x32.png'));
      const video = await encodeVideo(
        kind === 'home' ? { kind, first } : { kind, first, last: first, packet },
      );
      expect(video.subarray(4, 8).toString()).toBe('ftyp');
      expect(video.indexOf('moov')).toBeGreaterThan(0);
      expect(video.indexOf('moov')).toBeLessThan(video.indexOf('mdat'));
      expect(video.length).toBeLessThan(2 * 1024 * 1024);
    },
    15000,
  );
});
