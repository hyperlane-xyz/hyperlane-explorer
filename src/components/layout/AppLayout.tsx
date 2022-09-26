import Head from 'next/head';
import { PropsWithChildren } from 'react';

import { toTitleCase } from '../../utils/string';
import { Footer } from '../nav/Footer';
import { Header } from '../nav/Header';

interface Props {
  pathName: string;
}

export function AppLayout({ pathName, children }: PropsWithChildren<Props>) {
  return (
    <>
      <Head>
        {/* https://nextjs.org/docs/messages/no-document-viewport-meta */}
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{`Hyperlane Explorer [BETA] | ${getHeadTitle(pathName)}`}</title>
      </Head>
      <div className="h-full min-h-screen w-full min-w-screen bg-gray-100">
        <div className="max-w-5xl mx-auto flex flex-col justify-between min-h-screen">
          <Header pathName={pathName} />
          <main className="w-full flex-1">{children}</main>
          <Footer />
        </div>
      </div>
    </>
  );
}

function getHeadTitle(pathName: string) {
  const segments = pathName.split('/');
  if (segments.length <= 1 || !segments[1]) return 'Home';
  else return toTitleCase(segments[1]);
}
