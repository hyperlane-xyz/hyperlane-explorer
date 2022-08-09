import { Head, Html, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html>
      <Head>
        <meta charSet="utf-8" />

        <link
          rel="apple-touch-icon"
          sizes="180x180"
          href="/apple-touch-icon.png"
        />
        <link
          rel="icon"
          type="image/png"
          sizes="32x32"
          href="/favicon-32x32.png"
        />
        <link
          rel="icon"
          type="image/png"
          sizes="16x16"
          href="/favicon-16x16.png"
        />
        <link rel="manifest" href="/site.webmanifest" />
        <link rel="mask-icon" href="/safari-pinned-tab.svg" color="#5bbad5" />
        <link rel="shortcut icon" href="/favicon.ico" />
        <meta name="msapplication-TileColor" content="#da532c" />
        <meta name="theme-color" content="#ffffff" />

        <meta name="application-name" content="Abacus Explorer" />
        <meta
          name="keywords"
          content="Abacus Explorer App Multi-chain Cross-chain"
        />
        <meta
          name="description"
          content="A multi-chain explorer app for the Abacus protocol and network"
        />

        <meta name="HandheldFriendly" content="true" />
        <meta name="apple-mobile-web-app-title" content="Abacus Explorer" />
        <meta name="apple-mobile-web-app-capable" content="yes" />

        <meta property="og:url" content="https://explorer.useabacus.network" />
        <meta property="og:title" content="Abacus Explorer" />
        <meta property="og:type" content="website" />
        <meta
          property="og:image"
          content="https://explorer.useabacus.network/logo-with-text.png"
        />
        <meta
          property="og:description"
          content="A multi-chain explorer app for the Abacus protocol and network"
        />
      </Head>
      <body className="text-black">
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
