import { useMemo } from 'react';

import { MessageTimeline, useMessageStage } from '@hyperlane-xyz/widgets';

import { Card } from '../../../components/layout/Card';
import { Message } from '../../../types';

interface Props {
  message: Message;
  shouldBlur?: boolean;
}

export function TimelineCard({ message }: Props) {
  // TODO update Timeline widget schema to newer message shape so this x-form is not needed
  const partialMessage = useMemo(
    () => ({
      ...message,
      originTransaction: {
        blockNumber: message.origin.blockNumber,
        timestamp: message.origin.timestamp,
      },
      destinationTransaction: message.destination
        ? {
            blockNumber: message.destination.blockNumber,
            timestamp: message.destination.timestamp,
          }
        : undefined,
    }),
    [message],
  );
  const { stage, timings } = useMessageStage({ message: partialMessage });

  return (
    <Card classes="w-full">
      {/* <div className="flex items-center justify-end">
        <h3 className="text-gray-500 font-medium text-md mr-2">Delivery Timeline</h3>
        <HelpIcon size={16} text="A breakdown of the stages for delivering a message" />
      </div> */}
      <div className="-mx-2 sm:mx-0 -my-2">
        <MessageTimeline status={message.status} stage={stage} timings={timings} />
      </div>
    </Card>
  );
}
