import type { GetServerSideProps, NextPage } from 'next';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';
import { useEffect } from 'react';

import { OGHead } from '../../components/OGHead';
import { APP_DESCRIPTION, APP_NAME } from '../../consts/appMetadata';
import { fetchDomainNames, fetchMessageForOG } from '../../features/messages/queries/serverFetch';
import { deserializeMessage } from '../../features/messages/utils';
import { Message } from '../../types';
import { logger } from '../../utils/logger';
import { fetchChainMetadata, getChainDisplayName } from '../../utils/yamlParsing';

// Dynamic import with ssr: false to avoid pino-pretty issues during SSR
const MessageDetails = dynamic(
  () => import('../../features/messages/MessageDetails').then((mod) => mod.MessageDetails),
  { ssr: false },
);

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

  const message = data ? deserializeMessage<Message>(data) : undefined;

  // Generate OG metadata - use ogData from SSR props, not router.query
  // This ensures meta tags are rendered during SSR for social crawlers
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
  const ogTitle = ogData ? `Message ${shortMsgId} · ${APP_NAME}` : APP_NAME;
  const ogDescription = ogData
    ? `${ogData.originChain} → ${ogData.destChain} message on ${formattedDate}. View details on ${APP_NAME}.`
    : APP_DESCRIPTION;
  const ogImage = ogData
    ? `${host}/api/og?messageId=${ogData.messageId}`
    : `${host}/images/logo.png`;
  const ogUrl = ogData ? `${host}/message/${ogData.messageId}` : host;
  const logoUrl = `${host}/images/logo.png`;

  // Render nothing while waiting for client-side router
  if (!messageId || typeof messageId !== 'string') {
    return (
      <OGHead
        title={ogTitle}
        description={ogDescription}
        url={ogUrl}
        image={ogImage}
        logoUrl={logoUrl}
      />
    );
  }

  return (
    <>
      <OGHead
        title={ogTitle}
        description={ogDescription}
        url={ogUrl}
        image={ogImage}
        logoUrl={logoUrl}
      />
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
