/** @jest-environment jsdom */
import type { PropsWithChildren } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { OGHead } from './OGHead';

jest.mock('next/head', () => ({
  __esModule: true,
  default: ({ children }: PropsWithChildren) => <>{children}</>,
}));

function renderHead(video?: string) {
  const head = document.createElement('head');
  head.innerHTML = renderToStaticMarkup(
    <OGHead
      title="Base → Ethereum"
      image="https://example.com/poster.png"
      imageAlt="1,250 USDC, delivered in 24 seconds"
      video={video}
    />,
  );
  return head;
}

describe('OGHead', () => {
  it('preserves image-only cards when no video is supplied', () => {
    const head = renderHead();
    expect(head.querySelector('[property="og:type"]')?.getAttribute('content')).toBe('website');
    expect(head.querySelector('[name="twitter:card"]')?.getAttribute('content')).toBe(
      'summary_large_image',
    );
    expect(head.querySelector('[property="og:video"]')).toBeNull();
  });

  it('provides a direct MP4 with poster and dimensions, keeping the Discord video layout last', () => {
    const head = renderHead('https://example.com/clip.mp4');
    const meta = (key: string) =>
      head.querySelector(`[property="${key}"]`)?.getAttribute('content');
    expect(meta('og:video')).toBe('https://example.com/clip.mp4');
    expect(meta('og:video:secure_url')).toBe('https://example.com/clip.mp4');
    expect(meta('og:video:type')).toBe('video/mp4');
    expect(meta('og:video:width')).toBe('1200');
    expect(meta('og:video:height')).toBe('630');
    expect(meta('og:image')).toBe('https://example.com/poster.png');
    const layoutTags = head.querySelectorAll('[property="og:type"], [name="twitter:card"]');
    expect(layoutTags[layoutTags.length - 1]?.getAttribute('content')).toBe('video.other');
  });

  it('provides accessible poster descriptions to both card formats', () => {
    const head = renderHead();
    expect(head.querySelector('[property="og:image:alt"]')?.getAttribute('content')).toBe(
      '1,250 USDC, delivered in 24 seconds',
    );
    expect(head.querySelector('[name="twitter:image:alt"]')?.getAttribute('content')).toBe(
      '1,250 USDC, delivered in 24 seconds',
    );
  });
});
