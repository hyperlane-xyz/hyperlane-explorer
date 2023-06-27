import type { NextPage } from 'next';
import { useRouter } from 'next/router';
import { useEffect } from 'react';

import { MessageDetails } from '../../features/messages/MessageDetails';
import { deserializeMessage } from '../../features/messages/utils';
import { Message } from '../../types';
import { logger } from '../../utils/logger';

const MessagePage: NextPage = () => {
  const router = useRouter();
  const { messageId, data } = router.query;

  useEffect(() => {
    if (!messageId || typeof messageId !== 'string')
      router.replace('/').catch((e) => logger.error('Error routing back to home', e));
  }, [router, messageId]);
  if (!messageId || typeof messageId !== 'string') return null;

  const message = data ? deserializeMessage<Message>(data) : undefined;

  return <MessageDetails messageId={messageId} message={message} />;
};

// Required for dynamic routing to work by disabling Automatic Static Optimization
export async function getServerSideProps() {
  return {
    props: {},
  };
}

export default MessagePage;
