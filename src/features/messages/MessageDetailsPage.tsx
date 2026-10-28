import dynamic from 'next/dynamic';

import { MessageDetailsLoading } from './MessageDetailsLoading';
import { getPrefetchedMessageStub } from './queries/prefetch';

const ChainConfigSyncEffect = dynamic(
  () => import('../chains/ChainConfigSyncer').then((mod) => mod.ChainConfigSyncEffect),
  { ssr: false },
);
const MessageDetailsInner = dynamic(
  () => import('./MessageDetailsInner').then((mod) => mod.MessageDetailsInner),
  { loading: () => <MessageDetailsLoading /> },
);

export function MessageDetailsPage({ messageId }: { messageId: string }) {
  // Message content is never read from the URL; only stubs from this session's own searches.
  const initialMessage = getPrefetchedMessageStub(messageId);

  return (
    <>
      <ChainConfigSyncEffect />
      <MessageDetailsInner messageId={messageId} message={initialMessage} />
    </>
  );
}
