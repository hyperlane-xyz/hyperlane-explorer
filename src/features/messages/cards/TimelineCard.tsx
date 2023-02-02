import { useMemo } from 'react';

import { MessageTimeline, useMessageStage } from '@hyperlane-xyz/widgets';

import { Card } from '../../../components/layout/Card';
import { Message, MessageStatus, PartialTransactionReceipt } from '../../../types';

interface Props {
  message: Message;
  resolvedStatus: MessageStatus;
  resolvedDestinationTx?: PartialTransactionReceipt;
  shouldBlur?: boolean;
}

export function TimelineCard({ message, resolvedStatus, resolvedDestinationTx }: Props) {
  const resolvedMessage = useMemo(
    () => ({ ...message, status: resolvedStatus, destinationTransaction: resolvedDestinationTx }),
    [message, resolvedStatus, resolvedDestinationTx],
  );

  const { stage, timings } = useMessageStage({ message });

  return (
    <Card classes="w-full">
      {/* <div className="flex items-center justify-end">
        <h3 className="text-gray-500 font-medium text-md mr-2">Delivery Timeline</h3>
        <HelpIcon size={16} text="A breakdown of the stages for delivering a message" />
      </div> */}
      <div className="">
        <MessageTimeline status={resolvedMessage.status} stage={stage} timings={timings} />
      </div>
    </Card>
  );
}
