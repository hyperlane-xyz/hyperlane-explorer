import { useStore } from '../../store';
import { Message, MessageStub } from '../../types';
import { ChainConfigSyncer } from '../chains/ChainConfigSyncer';
import { MessageDetails } from './MessageDetails';
import { getPrefetchedMessageDetails } from './queries/prefetch';

export function MessageDetailsPage({
  messageId,
  message,
}: {
  messageId: string;
  message?: Message | MessageStub;
}) {
  const prefetchedMessage = useStore((s) => s.prefetchedMessagesById[messageId]);
  const prefetchedMessageDetails = getPrefetchedMessageDetails(messageId);

  return (
    <ChainConfigSyncer>
      <MessageDetails
        messageId={messageId}
        message={message || prefetchedMessageDetails || prefetchedMessage}
      />
    </ChainConfigSyncer>
  );
}
