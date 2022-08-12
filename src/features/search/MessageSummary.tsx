import { ChainToChain } from '../../components/icons/ChainToChain';
import { Message } from '../../types';

export function MessageSummary({ message }: { message: Message }) {
  return (
    <div className="flex items-center">
      <ChainToChain
        originChainId={message.originChainId}
        destinationChainId={message.destinationChainId}
      />
      <div className="ml-3 sm:ml-6">{message.sender}</div>
    </div>
  );
}
