import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { encodeVideo } from '../src/features/og-video/encodeVideo';

async function main() {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const first = await readFile(join(root, 'public/images/og-preview.png'));
  const video = await encodeVideo({ kind: 'home', first });
  await mkdir(join(root, 'public/og-video'), { recursive: true });
  await writeFile(join(root, 'public/og-video/home.mp4'), video);
  console.log(`Homepage OG video: ${video.length} bytes`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
