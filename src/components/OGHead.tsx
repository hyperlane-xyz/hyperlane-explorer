import Head from 'next/head';

import {
  APP_DESCRIPTION,
  APP_NAME,
  OG_BASE_URL,
  OG_IMAGE_HEIGHT,
  OG_IMAGE_WIDTH,
} from '../consts/appMetadata';

interface OGHeadProps {
  title?: string;
  description?: string;
  url?: string;
  image?: string;
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
}: OGHeadProps) {
  return (
    <Head>
      <title>{title}</title>
      <meta key="description" name="description" content={description} />

      {/* Open Graph */}
      {url && <meta key="og:url" property="og:url" content={url} />}
      <meta key="og:title" property="og:title" content={title} />
      <meta key="og:type" property="og:type" content="website" />
      {image && (
        <>
          <meta key="og:image" property="og:image" content={image} />
          <meta key="og:image:width" property="og:image:width" content={String(OG_IMAGE_WIDTH)} />
          <meta
            key="og:image:height"
            property="og:image:height"
            content={String(OG_IMAGE_HEIGHT)}
          />
        </>
      )}
      <meta key="og:description" property="og:description" content={description} />
      <meta key="og:logo" property="og:logo" content={`${OG_BASE_URL}/images/logo.svg`} />

      {/* Twitter Card */}
      <meta key="twitter:card" name="twitter:card" content="summary_large_image" />
      <meta key="twitter:title" name="twitter:title" content={title} />
      <meta key="twitter:description" name="twitter:description" content={description} />
      {image && <meta key="twitter:image" name="twitter:image" content={image} />}
    </Head>
  );
}
