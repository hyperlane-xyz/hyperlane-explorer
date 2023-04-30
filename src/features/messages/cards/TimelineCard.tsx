import { MessageTimeline, useMessageStage } from '@hyperlane-xyz/widgets';

import { Card } from '../../../components/layout/Card';
import { Message } from '../../../types';

interface Props {
  message: Message;
  shouldBlur?: boolean;
}

export function TimelineCard({ message, shouldBlur }: Props) {
  const { stage, timings } = useMessageStage({ message });

  return (
    <Card classes="w-full">
      {/* <div className="flex items-center justify-end">
        <h3 className="text-gray-500 font-medium text-md mr-2">Delivery Timeline</h3>
        <HelpIcon size={16} text="A breakdown of the stages for delivering a message" />
      </div> */}
      <div className={`-mx-2 sm:mx-0 -my-2 ${shouldBlur && 'blur-xs'}`}>
        <MessageTimeline status={message.status} stage={stage} timings={timings} />
      </div>
    </Card>
  );
}
