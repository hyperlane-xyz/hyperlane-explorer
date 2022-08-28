import type { NextPage } from 'next';
import { useRouter } from 'next/router';
import { useEffect } from 'react';

import { ContentFrame } from '../../components/layout/ContentFrame';
import { MessageDetails } from '../../features/search/MessageDetails';
import { logger } from '../../utils/logger';

const Message: NextPage = () => {
  const router = useRouter();
  const { messageId } = router.query;

  useEffect(() => {
    if (!messageId || typeof messageId !== 'string')
      router
        .replace('/')
        .catch((e) => logger.error('Error routing back to home', e));
  }, [router, messageId]);
  if (!messageId || typeof messageId !== 'string') return null;

  return (
    <ContentFrame>
      <MessageDetails messageId={messageId} />
    </ContentFrame>
  );
};

// Required for dynamic routing to work by disabling Automatic Static Optimization
export async function getServerSideProps() {
  return {
    props: {},
  };
}

export default Message;
