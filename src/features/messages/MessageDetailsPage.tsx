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
  const initialMessage =
    message && 'blockNumber' in message.origin
      ? message
      : prefetchedMessageDetails || message || prefetchedMessage;

  return (
    <>
      <ChainConfigSyncEffect />
      <MessageDetailsInner messageId={messageId} message={initialMessage} />
    </>
  );
}
