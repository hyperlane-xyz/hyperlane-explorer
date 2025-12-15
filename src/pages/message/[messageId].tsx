import type { GetServerSideProps, NextPage } from 'next';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useEffect } from 'react';

import { MessageDetails } from '../../features/messages/MessageDetails';
import { deserializeMessage } from '../../features/messages/utils';
import { Message } from '../../types';
import { logger } from '../../utils/logger';
import { fetchDomainNames, fetchMessageForOG } from '../../utils/serverFetch';
import { fetchChainMetadata, getChainDisplayName } from '../../utils/yamlParsing';

interface OGData {
  messageId: string;
  originChain: string;
  destChain: string;
  timestamp: number;
}

interface PageProps {
  ogData: OGData | null;
  host: string;
}

const MessagePage: NextPage<PageProps> = ({ ogData, host }) => {
  const router = useRouter();
  const { messageId, data } = router.query;

  useEffect(() => {
    if (!messageId || typeof messageId !== 'string')
      router.replace('/').catch((e) => logger.error('Error routing back to home', e));
  }, [router, messageId]);
  if (!messageId || typeof messageId !== 'string') return null;

  const message = data ? deserializeMessage<Message>(data) : undefined;

  // Generate OG metadata
  const shortMsgId = ogData
    ? `${ogData.messageId.slice(0, 6)}...${ogData.messageId.slice(-4)}`
    : '';
  const formattedDate = ogData
    ? new Date(ogData.timestamp).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : '';
  const ogTitle = ogData ? `Message ${shortMsgId} · Hyperlane Explorer` : 'Hyperlane Explorer';
  const ogDescription = ogData
    ? `${ogData.originChain} → ${ogData.destChain} message on ${formattedDate}. View details on Hyperlane Explorer.`
    : 'The interchain explorer for the Hyperlane protocol.';
  const ogImage = ogData
    ? `${host}/api/og?messageId=${ogData.messageId}`
    : `${host}/images/logo.png`;

  return (
    <>
      <Head>
        <title>{ogTitle}</title>
        <meta name="description" content={ogDescription} />

        {/* Open Graph */}
        <meta property="og:url" content={`${host}/message/${messageId}`} />
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
      <MessageDetails messageId={messageId} message={message} />
    </>
  );
};

export const getServerSideProps: GetServerSideProps<PageProps> = async (ctx) => {
  const { messageId } = ctx.query;
  let ogData: OGData | null = null;

  // Get the host from the request for absolute OG image URLs
  const host = ctx.req?.headers?.host || 'explorer.hyperlane.xyz';
  const protocol = host.includes('localhost') ? 'http' : 'https';
  const baseUrl = `${protocol}://${host}`;

  if (messageId && typeof messageId === 'string') {
    try {
      const [messageData, domainNames, chainMetadata] = await Promise.all([
        fetchMessageForOG(messageId),
        fetchDomainNames(),
        fetchChainMetadata(),
      ]);

      if (messageData) {
        const originChainName =
          domainNames.get(messageData.originDomainId) || `Domain ${messageData.originDomainId}`;
        const destChainName =
          domainNames.get(messageData.destinationDomainId) ||
          `Domain ${messageData.destinationDomainId}`;

        ogData = {
          messageId,
          originChain: getChainDisplayName(originChainName, chainMetadata),
          destChain: getChainDisplayName(destChainName, chainMetadata),
          timestamp: messageData.timestamp,
        };
      }
    } catch {
      // Silently fail - will use default OG tags
    }
  }

  return {
    props: {
      ogData,
      host: baseUrl,
    },
  };
};

export default MessagePage;
