import { Head, Html, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        <meta charSet="utf-8" />

        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
        <link rel="manifest" href="/site.webmanifest" />
        <link rel="mask-icon" href="/safari-pinned-tab.svg" color="#9A0DFF" />
        <link rel="shortcut icon" href="/favicon.png" />
        <meta name="msapplication-TileColor" content="#9A0DFF" />
        <meta name="theme-color" content="#f8f8ff" />

        <meta name="application-name" content="Hyperlane Explorer" />
        <meta
          name="keywords"
          content="Hyperlane Explorer Scan Interchain Permissionless Interoperability Network Blockchain"
        />

        <meta name="HandheldFriendly" content="true" />
        <meta name="apple-mobile-web-app-title" content="Hyperlane Explorer" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
      </Head>
      <body className="font-sans text-black">
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
