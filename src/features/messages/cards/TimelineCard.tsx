import { MessageTimeline, useMessageStage } from '@hyperlane-xyz/widgets';

import { Card } from '../../../components/layout/Card';
import { Message } from '../../../types';

interface Props {
  message: Message;
  blur?: boolean;
}

export function TimelineCard({ message, blur }: Props) {
  // @ts-ignore TODO update widget chainId type
  const { stage, timings } = useMessageStage({ message });

  return (
    <Card className="w-full">
      {/* <div className="flex items-center justify-end">
        <h3 className="text-gray-500 font-medium text-md mr-2">Delivery Timeline</h3>
        <HelpIcon size={16} text="A breakdown of the stages for delivering a message" />
      </div> */}
      <div className={`-mx-2 -my-2 font-light sm:mx-0 ${blur && 'blur-xs'}`}>
        <MessageTimeline status={message.status} stage={stage} timings={timings} />
      </div>
    </Card>
  );
}
