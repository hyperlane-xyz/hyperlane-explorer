import dynamic from 'next/dynamic';
import { Message, MessageStub } from '../../types';
import { MessageDetailsLoading } from './MessageDetailsLoading';
import { getPrefetchedMessageDetails, getPrefetchedMessageStub } from './queries/prefetch';

const ChainConfigSyncEffect = dynamic(
  () => import('../chains/ChainConfigSyncer').then((mod) => mod.ChainConfigSyncEffect),
  { ssr: false },
);
const MessageDetailsInner = dynamic(
  () => import('./MessageDetailsInner').then((mod) => mod.MessageDetailsInner),
  { loading: () => <MessageDetailsLoading /> },
);

export function MessageDetailsPage({
  messageId,
  message,
}: {
  messageId: string;
  message?: Message | MessageStub;
}) {
  const prefetchedMessage = getPrefetchedMessageStub(messageId);
  const prefetchedMessageDetails = getPrefetchedMessageDetails(messageId);

  return (
    <>
      <ChainConfigSyncEffect />
      <MessageDetailsInner
        messageId={messageId}
        message={message || prefetchedMessageDetails || prefetchedMessage}
      />
    </>
  );
}
