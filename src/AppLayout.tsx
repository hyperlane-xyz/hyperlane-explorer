import dynamic from 'next/dynamic';
import Head from 'next/head';
import { PropsWithChildren } from 'react';

import { Header } from './components/nav/Header';

const Footer = dynamic(() => import('./components/nav/Footer').then((mod) => mod.Footer), {
  loading: () => <div className="h-24 sm:h-28" />,
  ssr: false,
});

interface Props {
  pathName: string;
}

export function AppLayout({ pathName, children }: PropsWithChildren<Props>) {
  return (
    <>
      <Head>
        {/* https://nextjs.org/docs/messages/no-document-viewport-meta */}
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{`Hyperlane Explorer | ${getHeadTitle(pathName)}`}</title>
      </Head>
      <div className="min-w-screen relative flex h-full min-h-screen w-full flex-col justify-between bg-brand-gradient">
        <div className="pointer-events-none absolute inset-0 z-0" style={styles.gridOverlay} />
        <Header pathName={pathName} />
        <div className="relative z-10 mx-auto max-w-5xl grow">
          <main style={styles.main} className="relative min-h-full pt-3">
            {children}
          </main>
        </div>
        <Footer />
      </div>
    </>
  );
}

function getHeadTitle(pathName: string) {
  const segments = pathName.split('/');
  if (segments.length <= 1 || !segments[1]) return 'Home';
  return titleCase(segments[1]);
}

function titleCase(value: string) {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

const styles = {
  gridOverlay: {
    backgroundImage: 'url(/images/background.svg)',
    backgroundSize: '100% auto',
    backgroundRepeat: 'repeat',
    maskImage:
      'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.6) 100vh, rgba(0,0,0,1) 100%)',
    WebkitMaskImage:
      'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.6) 100vh, rgba(0,0,0,1) 100%)',
  } as React.CSSProperties,
  main: {
    width: 'min(900px,96vw)',
  },
};
