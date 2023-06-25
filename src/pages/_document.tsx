import { Head, Html, Main, NextScript } from 'next/document';

import { links } from '../consts/links';

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        <meta charSet="utf-8" />

        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
        <link rel="manifest" href="/site.webmanifest" />
        <link rel="mask-icon" href="/safari-pinned-tab.svg" color="#2362C1" />
        <link rel="shortcut icon" href="/favicon.ico" />
        <meta name="msapplication-TileColor" content="#2362C1" />
        <meta name="theme-color" content="#ffffff" />

        <meta name="application-name" content="Hyperlane Explorer" />
        <meta
          name="keywords"
          content="Hyperlane Explorer Scan Interchain Permissionless Interoperability Network Blockchain"
        />
        <meta
          name="description"
          content="The official interchain explorer for the Hyperlane protocol and network."
        />

        <meta name="HandheldFriendly" content="true" />
        <meta name="apple-mobile-web-app-title" content="Hyperlane Explorer" />
        <meta name="apple-mobile-web-app-capable" content="yes" />

        <meta property="og:url" content={links.baseUrl} />
        <meta property="og:title" content="Hyperlane Explorer" />
        <meta property="og:type" content="website" />
        <meta property="og:image" content={links.baseUrl + '/logo.png'} />
        <meta
          property="og:description"
          content="The official interchain explorer for the Hyperlane protocol and network."
        />
      </Head>
      <body className="text-black">
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
