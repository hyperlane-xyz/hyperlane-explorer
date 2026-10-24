import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import ffmpeg from '@ffmpeg-installer/ffmpeg';
import { ImageResponse } from '@vercel/og';
import { createElement } from 'react';

import { OG_IMAGE_HEIGHT, OG_IMAGE_WIDTH } from '../src/consts/appMetadata';
import {
  MessageVideoCard,
  type VideoPreviewStatus,
} from '../src/features/og-video/MessageVideoCard';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = join(root, 'public/og-video');
const fps = 24;
const duration = 5;

async function main() {
  const logo = `data:image/svg+xml;base64,${await readFile(
    join(root, 'public/images/hyperlane-explorer-logo.svg'),
    'base64',
  )}`;
  // Same font as the existing OG cards when available; bundled Noto Sans otherwise.
  let fonts: { name: string; data: ArrayBuffer; weight: 400; style: 'normal' }[] | undefined;
  try {
    const data = await readFile(join(root, 'public/fonts/PPFraktionMono-Regular.ttf'));
    fonts = [{ name: 'mono', data: new Uint8Array(data).buffer, weight: 400, style: 'normal' }];
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
    console.log('Preview font unavailable; using bundled Noto Sans.');
  }

  const temp = await mkdtemp(join(tmpdir(), 'explorer-og-video-'));
  try {
    await mkdir(output, { recursive: true });
    for (const status of ['delivered', 'pending'] satisfies VideoPreviewStatus[]) {
      for (let frame = 0; frame < fps * duration; frame++) {
        const image = new ImageResponse(
          createElement(MessageVideoCard, { status, time: frame / fps, logo }),
          { width: OG_IMAGE_WIDTH, height: OG_IMAGE_HEIGHT, fonts },
        );
        const data = Buffer.from(await image.arrayBuffer());
        await writeFile(join(temp, `${String(frame).padStart(3, '0')}.png`), data);
        // A complete card rather than an empty first frame when playback is unavailable.
        if (frame === fps * duration - 1) await writeFile(join(output, `${status}.png`), data);
      }

      const result = spawnSync(
        ffmpeg.path,
        [
          '-hide_banner',
          '-loglevel',
          'error',
          '-y',
          '-framerate',
          String(fps),
          '-i',
          join(temp, '%03d.png'),
          '-an',
          '-c:v',
          'libx264',
          '-profile:v',
          'baseline',
          '-pix_fmt',
          'yuv420p',
          '-crf',
          '24',
          '-movflags',
          '+faststart',
          join(output, `${status}.mp4`),
        ],
        { stdio: 'inherit' },
      );
      if (result.error) throw result.error;
      if (result.status !== 0) throw new Error(`FFmpeg failed for ${status}: ${result.status}`);

      const { size } = await stat(join(output, `${status}.mp4`));
      const poster = await stat(join(output, `${status}.png`));
      if (size + poster.size > 2 * 1024 * 1024) {
        throw new Error(`${status} clip and poster exceed the 2 MiB budget`);
      }
      console.log(
        `${status}: ${duration}s, ${OG_IMAGE_WIDTH}x${OG_IMAGE_HEIGHT}, ${size} video bytes, ${poster.size} poster bytes`,
      );
    }
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
