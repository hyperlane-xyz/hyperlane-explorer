import clsx from 'clsx';
import type { GetServerSideProps, InferGetServerSidePropsType } from 'next';
import Head from 'next/head';
import Link from 'next/link';

import { OGHead } from '../../components/OGHead';
import { OG_BASE_URL } from '../../consts/appMetadata';
import type { VideoPreviewStatus } from '../../features/og-video/MessageVideoCard';

interface Props {
  status: VideoPreviewStatus;
  still: boolean;
  baseUrl: string;
}

export default function VideoPreviewPage({
  status,
  still,
  baseUrl,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const image = `/og-video/${status}.png`;
  const video = `/og-video/${status}.mp4`;
  const url = `${baseUrl}/preview/og-video?status=${status}${still ? '&still=1' : ''}`;
  const description =
    status === 'delivered'
      ? 'An illustrative 1,250 USDC transfer from Base to Ethereum, delivered in 24 seconds.'
      : 'An illustrative 1,250 USDC transfer from Base to Ethereum, awaiting delivery.';

  return (
    <>
      <OGHead
        title={`Base → Ethereum · ${status === 'delivered' ? 'Delivered' : 'Pending'}`}
        description={description}
        url={url}
        image={`${baseUrl}${image}`}
        imageAlt={description}
        video={still ? undefined : `${baseUrl}${video}`}
      />
      <Head>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <div className="mx-auto w-full max-w-5xl px-4 pb-16 pt-8 sm:px-8 sm:pt-12">
        <div className="mb-3 flex items-center gap-3 text-xs uppercase tracking-widest text-primary-100">
          <span>Share previews</span>
          <span className="rounded border border-primary-400/40 px-2 py-1">Prototype</span>
        </div>
        <h1 className="text-2xl text-white sm:text-4xl">A message, in motion.</h1>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-primary-100">
          A short replay of a cross-chain transfer. Compare the animated card with its still image,
          then share this page to try the link preview. Sample data, not a live transaction.
        </p>

        <div className="mb-5 mt-8 flex flex-wrap items-center justify-between gap-4">
          <nav aria-label="Example status" className="flex gap-1 rounded bg-primary-950/70 p-1">
            {(['delivered', 'pending'] as const).map((value) => (
              <Link
                key={value}
                href={`/preview/og-video?status=${value}${still ? '&still=1' : ''}`}
                aria-current={status === value ? 'page' : undefined}
                className={clsx(
                  'rounded px-4 py-2 text-sm capitalize focus-visible:ring-2 focus-visible:ring-primary-200',
                  status === value ? 'bg-primary-800 text-white' : 'text-primary-100',
                )}
              >
                {value}
              </Link>
            ))}
          </nav>
          <nav aria-label="Preview format" className="flex gap-4 text-xs text-primary-100">
            <Link
              href={`/preview/og-video?status=${status}`}
              aria-current={!still ? 'page' : undefined}
              className={clsx(
                'py-2 focus-visible:ring-2',
                !still && 'text-white underline underline-offset-4',
              )}
            >
              Video
            </Link>
            <Link
              href={`/preview/og-video?status=${status}&still=1`}
              aria-current={still ? 'page' : undefined}
              className={clsx(
                'py-2 focus-visible:ring-2',
                still && 'text-white underline underline-offset-4',
              )}
            >
              Still image
            </Link>
          </nav>
        </div>

        <div className="overflow-hidden rounded-lg border border-primary-300/25 bg-[#0d0816] shadow-xl">
          {still ? (
            <img
              src={image}
              alt={description}
              width={1200}
              height={630}
              className="h-auto w-full"
            />
          ) : (
            <video
              key={status}
              controls
              loop
              muted
              playsInline
              preload="metadata"
              poster={image}
              width={1200}
              height={630}
              aria-label={description}
              className="h-auto w-full"
            >
              <source src={video} type="video/mp4" />
              <a href={video}>Download the animated preview</a>
            </video>
          )}
        </div>
        <div className="mt-4 flex flex-wrap justify-between gap-3 text-xs text-primary-100">
          <span>
            {still ? 'Poster / image fallback' : '5-second replay · silent · press play to preview'}
          </span>
          <a href={still ? image : video} className="underline underline-offset-4">
            Open {still ? 'image' : 'video'}
          </a>
        </div>
        <div className="mt-10 grid gap-6 border-t border-primary-300/20 pt-6 text-sm text-primary-100 sm:grid-cols-2">
          <div>
            <h2 className="mb-2 text-white">Try a shared link</h2>
            <p className="leading-relaxed">
              Paste this page’s URL into iMessage or Discord. Video support and autoplay depend on
              the app and your settings. Other apps can use the still image.
            </p>
          </div>
          <div>
            <h2 className="mb-2 text-white">Pending stays pending</h2>
            <p className="leading-relaxed">
              Delivered replays end at the destination. Pending examples keep moving without showing
              a successful receipt. Both retain the message details in their poster.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const host = ctx.req.headers.host ?? new URL(OG_BASE_URL).host;
  const protocol =
    host.startsWith('localhost:') || host.startsWith('127.0.0.1:') ? 'http' : 'https';

  return {
    props: {
      status: ctx.query.status === 'pending' ? 'pending' : 'delivered',
      still: ctx.query.still === '1',
      baseUrl: `${protocol}://${host}`,
    },
  };
};
