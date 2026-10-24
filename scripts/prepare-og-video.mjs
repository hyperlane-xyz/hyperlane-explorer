import { copyFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import ffmpeg from '@ffmpeg-installer/ffmpeg';

// Trace one executable instead of both pnpm's real path and optional-dependency symlink.
await mkdir('.generated', { recursive: true });
await copyFile(ffmpeg.path, join('.generated', 'ffmpeg'));
