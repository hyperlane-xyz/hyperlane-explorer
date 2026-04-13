// Default metadata strings for OG tags and page metadata
// These constants ensure consistency across the app and OG image generation

export const APP_NAME = 'Hyperlane Explorer';
export const APP_DESCRIPTION = 'The interchain explorer for the Hyperlane protocol.';
export const APP_URL = 'https://explorer.hyperlane.xyz';

// Use Vercel preview URL when available so OG images work on preview deployments
export const OG_BASE_URL =
  process.env.NEXT_PUBLIC_VERCEL_ENV === 'preview' && process.env.NEXT_PUBLIC_VERCEL_URL
    ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`
    : APP_URL;

// OG Image dimensions
export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 630;
