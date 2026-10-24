import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import ffmpeg from '@ffmpeg-installer/ffmpeg';

const run = promisify(execFile);

type Frames =
  | { kind: 'home'; first: Buffer }
  | { kind: 'delivered' | 'pending'; first: Buffer; last: Buffer; packet: Buffer };

/** Animate keyframes instead of rasterizing 120 full-size React frames per request. */
export async function encodeVideo(frames: Frames, timeout = 8000): Promise<Buffer> {
  const temp = await mkdtemp(join(tmpdir(), 'explorer-og-video-'));
  try {
    const first = join(temp, 'first.png');
    const output = join(temp, 'video.mp4');
    await writeFile(first, frames.first);
    const inputs = ['-loop', '1', '-framerate', '24', '-i', first];
    let filter: string;
    if (frames.kind === 'home') {
      // A slow, seamless camera movement over the actual homepage artwork.
      filter =
        "[0:v]zoompan=z='1+0.025*sin(PI*on/119)':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=1:s=1200x630:fps=24[video]";
    } else {
      const last = join(temp, 'last.png');
      const packet = join(temp, 'packet.png');
      await Promise.all([writeFile(last, frames.last), writeFile(packet, frames.packet)]);
      inputs.push(
        '-loop',
        '1',
        '-framerate',
        '24',
        '-i',
        last,
        '-loop',
        '1',
        '-framerate',
        '24',
        '-i',
        packet,
      );
      const delivered = frames.kind === 'delivered';
      const card = delivered ? "[0:v][1:v]overlay=enable='gte(t,3)'[card];" : '[0:v]null[card];';
      const x = delivered ? '318+500*min(1,max(0,(t-0.6)/2.4))' : '318+425*mod(t,2.5)/2.5';
      filter = `${card}[card][2:v]overlay=x='${x}':y=296${delivered ? ":enable='lt(t,3)'" : ''}[video]`;
    }
    await run(
      ffmpeg.path,
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-y',
        ...inputs,
        '-filter_complex_threads',
        '1',
        '-filter_complex',
        filter,
        '-map',
        '[video]',
        '-t',
        '5',
        '-r',
        '24',
        '-an',
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-threads',
        '2',
        '-profile:v',
        'baseline',
        '-pix_fmt',
        'yuv420p',
        '-crf',
        '24',
        '-movflags',
        '+faststart',
        output,
      ],
      { timeout, maxBuffer: 1024 * 1024 },
    );
    const video = await readFile(output);
    if (video.length > 2 * 1024 * 1024) throw new Error('OG video exceeds the 2 MiB budget');
    return video;
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}
