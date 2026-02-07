import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { createWriteStream, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FONTS_DIR = join(__dirname, '..', 'public', 'fonts');

// Font files to download from S3
const FONTS = [
  // Variable fonts for CSS (browser rendering)
  'PPValve-PlainVariable.woff2',
  'PPFraktionMono-Variable.woff2',
  // TTF fonts for OG image generation (Satori requires TTF)
  'PPValve-PlainMedium.ttf',
  'PPFraktionMono-Regular.ttf',
];

async function fetchFonts() {
  const { AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_S3_BUCKET, AWS_REGION } = process.env;

  // Gracefully skip if environment variables are not configured
  if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY || !AWS_S3_BUCKET) {
    console.warn('AWS environment variables not configured - skipping font download');
    console.warn(
      'To enable font fetching, set: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_S3_BUCKET',
    );
    return;
  }

  const s3 = new S3Client({
    region: AWS_REGION || 'us-east-1',
    credentials: {
      accessKeyId: AWS_ACCESS_KEY_ID,
      secretAccessKey: AWS_SECRET_ACCESS_KEY,
    },
  });

  // Ensure fonts directory exists
  if (!existsSync(FONTS_DIR)) {
    mkdirSync(FONTS_DIR, { recursive: true });
    console.log(`Created directory: ${FONTS_DIR}`);
  }

  const results = { success: [], failed: [] };

  // Download each font, continuing on failure
  for (const fontFile of FONTS) {
    const outputPath = join(FONTS_DIR, fontFile);

    try {
      console.log(`Downloading ${fontFile}...`);

      const command = new GetObjectCommand({
        Bucket: AWS_S3_BUCKET,
        Key: fontFile,
      });

      const response = await s3.send(command);
      const writeStream = createWriteStream(outputPath);

      await pipeline(Readable.fromWeb(response.Body.transformToWebStream()), writeStream);

      console.log(`Downloaded ${fontFile}`);
      results.success.push(fontFile);
    } catch (error) {
      console.warn(`Failed to download ${fontFile}: ${error.message}`);
      results.failed.push(fontFile);
    }
  }

  // Summary
  console.log(
    `\nFont download complete: ${results.success.length} succeeded, ${results.failed.length} failed`,
  );

  if (results.failed.length > 0) {
    console.warn('Failed fonts:', results.failed.join(', '));
  }
}

fetchFonts().catch((error) => {
  console.warn('Font fetch script encountered an error:', error.message);
  // Exit gracefully - don't fail the build
});
