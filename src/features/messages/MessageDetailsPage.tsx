import { Message } from '../../types';
import { ChainConfigSyncer } from '../chains/ChainConfigSyncer';
import { MessageDetails } from './MessageDetails';

export function MessageDetailsPage({
  messageId,
  message,
}: {
  messageId: string;
  message?: Message;
}) {
  return (
    <ChainConfigSyncer>
      <MessageDetails messageId={messageId} message={message} />
    </ChainConfigSyncer>
  );
}
