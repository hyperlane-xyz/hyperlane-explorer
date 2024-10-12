import Head from 'next/head';
import { PropsWithChildren } from 'react';

import { toTitleCase } from '@hyperlane-xyz/utils';

import { Footer } from './components/nav/Footer';
import { Header } from './components/nav/Header';

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
      <div
        style={styles.container}
        className="min-w-screen relative flex h-full min-h-screen w-full flex-col justify-between bg-blue-500"
      >
        {/* <InfoBanner /> */}
        <Header pathName={pathName} />
        <div className="mx-auto max-w-5xl grow">
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
  else return toTitleCase(segments[1]);
}

const styles = {
  container: {
    backgroundImage: 'url(/images/background.svg)',
    backgroundSize: 'cover',
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'center',
  },
  main: {
    width: 'min(900px,96vw)',
  },
};
