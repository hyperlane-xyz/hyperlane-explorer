import dynamic from 'next/dynamic';
import { Message, MessageStub } from '../../types';
import { MessageDetails } from './MessageDetails';
import { getPrefetchedMessageDetails, getPrefetchedMessageStub } from './queries/prefetch';

const ChainConfigSyncEffect = dynamic(
  () => import('../chains/ChainConfigSyncer').then((mod) => mod.ChainConfigSyncEffect),
  { ssr: false },
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
      <MessageDetails
        messageId={messageId}
        message={message || prefetchedMessageDetails || prefetchedMessage}
      />
    </>
  );
}
