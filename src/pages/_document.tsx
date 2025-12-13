import Document, {
  DocumentContext,
  DocumentInitialProps,
  Head,
  Html,
  Main,
  NextScript,
} from 'next/document';

import { MAIN_FONT } from '../styles/fonts';
import {
  fetchChainMetadata,
  fetchDomainNames,
  fetchMessageForOG,
  getChainDisplayName,
  MessageOGData,
} from '../utils/serverFetch';

interface MyDocumentProps extends DocumentInitialProps {
  ogData: {
    messageId: string;
    message: MessageOGData;
    originChain: string;
    destChain: string;
  } | null;
  host: string;
}

export default class MyDocument extends Document<MyDocumentProps> {
  static async getInitialProps(ctx: DocumentContext): Promise<MyDocumentProps> {
    // Fetch OG data BEFORE rendering the document to avoid pino-pretty SSR errors
    const pathname = ctx.pathname;
    const query = ctx.query;
    let ogData: MyDocumentProps['ogData'] = null;

    // Get the host from the request for absolute OG image URLs
    const host = ctx.req?.headers?.host || 'explorer.hyperlane.xyz';
    const protocol = host.includes('localhost') ? 'http' : 'https';
    const baseUrl = `${protocol}://${host}`;

    if (pathname === '/message/[messageId]' && query.messageId && typeof query.messageId === 'string') {
      try {
        const [messageData, domainNames, chainMetadata] = await Promise.all([
          fetchMessageForOG(query.messageId),
          fetchDomainNames(),
          fetchChainMetadata(),
        ]);

        if (messageData) {
          const originChainName = domainNames.get(messageData.originDomainId) || `Domain ${messageData.originDomainId}`;
          const destChainName = domainNames.get(messageData.destinationDomainId) || `Domain ${messageData.destinationDomainId}`;

          ogData = {
            messageId: query.messageId,
            message: messageData,
            originChain: getChainDisplayName(originChainName, chainMetadata),
            destChain: getChainDisplayName(destChainName, chainMetadata),
          };
        }
      } catch {
        // Silently fail - will use default OG tags
      }
    }

    const initialProps = await Document.getInitialProps(ctx);
    return { ...initialProps, ogData, host: baseUrl };
  }

  render() {
    const { ogData, host } = this.props;

    // Generate dynamic OG metadata for message pages
    const isMessagePage = ogData?.message;
    const shortMsgId = isMessagePage
      ? `${ogData.messageId.slice(0, 6)}...${ogData.messageId.slice(-4)}`
      : '';
    const formattedDate = isMessagePage
      ? new Date(ogData.message.timestamp).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })
      : '';
    const ogTitle = isMessagePage
      ? `Message ${shortMsgId} ⋅ Hyperlane Explorer`
      : 'Hyperlane Explorer';
    const ogDescription = isMessagePage
      ? `${ogData.originChain} → ${ogData.destChain} message on ${formattedDate}. View details on Hyperlane Explorer.`
      : 'The interchain explorer for the Hyperlane protocol.';
    const ogImage = isMessagePage
      ? `${host}/api/og?messageId=${ogData.messageId}`
      : host + '/images/logo.png';

    return (
      <Html lang="en">
        <Head>
          <meta charSet="utf-8" />

          <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
          <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
          <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
          <link rel="manifest" href="/site.webmanifest" />
          <link rel="mask-icon" href="/safari-pinned-tab.svg" color="#2362C1" />
          <link rel="shortcut icon" href="/favicon.png" />
          <meta name="msapplication-TileColor" content="#2362C1" />
          <meta name="theme-color" content="#ffffff" />

          <meta name="application-name" content="Hyperlane Explorer" />
          <meta
            name="keywords"
            content="Hyperlane Explorer Scan Interchain Permissionless Interoperability Network Blockchain"
          />
          <meta name="description" content={ogDescription} />

          <meta name="HandheldFriendly" content="true" />
          <meta name="apple-mobile-web-app-title" content="Hyperlane Explorer" />
          <meta name="apple-mobile-web-app-capable" content="yes" />

          {/* Open Graph */}
          <meta property="og:url" content={host} />
          <meta property="og:title" content={ogTitle} />
          <meta property="og:type" content="website" />
          <meta property="og:image" content={ogImage} />
          <meta property="og:image:width" content="1200" />
          <meta property="og:image:height" content="630" />
          <meta property="og:description" content={ogDescription} />

          {/* Twitter Card */}
          <meta name="twitter:card" content="summary_large_image" />
          <meta name="twitter:title" content={ogTitle} />
          <meta name="twitter:description" content={ogDescription} />
          <meta name="twitter:image" content={ogImage} />
        </Head>
        <body className={`${MAIN_FONT.variable} font-sans text-black`}>
          <Main />
          <NextScript />
        </body>
      </Html>
    );
  }
}
