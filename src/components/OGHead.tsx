import Head from 'next/head';

import { APP_DESCRIPTION, APP_NAME, OG_IMAGE_HEIGHT, OG_IMAGE_WIDTH } from '../consts/appMetadata';

interface OGHeadProps {
  title?: string;
  description?: string;
  url?: string;
  image?: string;
  logoUrl?: string;
}

/**
 * Reusable Open Graph and Twitter Card meta tags component.
 * Used across pages to ensure consistent social sharing metadata.
 */
export function OGHead({
  title = APP_NAME,
  description = APP_DESCRIPTION,
  url,
  image,
  logoUrl,
}: OGHeadProps) {
  return (
    <Head>
      <title>{title}</title>
      <meta name="description" content={description} />

      {/* Open Graph */}
      {url && <meta property="og:url" content={url} />}
      <meta property="og:title" content={title} />
      <meta property="og:type" content="website" />
      {image && (
        <>
          <meta property="og:image" content={image} />
          <meta property="og:image:width" content={String(OG_IMAGE_WIDTH)} />
          <meta property="og:image:height" content={String(OG_IMAGE_HEIGHT)} />
        </>
      )}
      <meta property="og:description" content={description} />
      {logoUrl && <meta property="og:logo" content={logoUrl} />}

      {/* Twitter Card */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      {image && <meta name="twitter:image" content={image} />}
    </Head>
  );
}
