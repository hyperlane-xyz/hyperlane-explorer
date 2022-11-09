import Image from 'next/future/image';

import { WideChevronIcon } from '../../../components/icons/WideChevron';
import { Card } from '../../../components/layout/Card';
import EnvelopeIcon from '../../../images/icons/envelope-check.svg';
import LockIcon from '../../../images/icons/lock.svg';
import AirplaneIcon from '../../../images/icons/paper-airplane.svg';
import ShieldIcon from '../../../images/icons/shield-check.svg';
import { Message } from '../../../types';

interface Props {
  message: Message;
  shouldBlur: boolean;
}

export function TimelineCard({ message, shouldBlur }: Props) {
  const timeSent = new Date(message.originTimestamp);

  return (
    <Card width="w-full">
      {/* <div className="flex items-center justify-end">
        <h3 className="text-gray-500 font-medium text-md mr-2">Delivery Timeline</h3>
        <HelpIcon size={16} text="A breakdown of the stages for delivering a message" />
      </div> */}
      <div className="px-4 pt-14 pb-1 flex">
        <div className="flex-1 flex flex-col items-center">
          <div className="w-full h-6 flex items-center justify-center bg-blue-500 rounded-l relative">
            <div className="w-3 h-3 rounded-full bg-white"></div>
            <div className="absolute -top-12 flex flex-col items-center">
              <StageIcon src={AirplaneIcon} />
              <div className="w-0.5 h-4 bg-blue-500"></div>
            </div>
            <div className="absolute -right-3 top-0 h-6">
              <WideChevronIcon direction="e" height="100%" width="auto" />
            </div>
          </div>
          <h4 className="mt-2.5 text-gray-700">Message sent</h4>
          <p className="mt-1 px-2 text-xs text-gray-500 text-center">{`Origin transaction sent at ${timeSent.toLocaleDateString()} ${timeSent.toLocaleTimeString()}`}</p>
        </div>
        <div className="flex-0 w-5"></div>
        <div className="flex-1 flex flex-col items-center">
          <div className="w-full h-6 flex items-center justify-center bg-blue-500 relative">
            <div className="w-3 h-3 rounded-full bg-white"></div>
            <div className="absolute -top-12 flex flex-col items-center">
              <StageIcon src={LockIcon} size={12} />
              <div className="w-0.5 h-4 bg-blue-500"></div>
            </div>
          </div>
          <h4 className="mt-2.5 text-gray-700">{`Finalized - ${'TODO'}`}</h4>
          <p className="mt-1 px-2 text-xs text-gray-500 text-center">{`Origin transaction has sufficient confirmations`}</p>
        </div>
        <div className="flex-0 w-5"></div>
        <div className="flex-1 flex flex-col items-center">
          <div className="w-full h-6 flex items-center justify-center bg-blue-500 relative">
            <div className="w-3 h-3 rounded-full bg-white"></div>
            <div className="absolute -top-12 flex flex-col items-center">
              <StageIcon src={ShieldIcon} />
              <div className="w-0.5 h-4 bg-blue-500"></div>
            </div>
          </div>
          <h4 className="mt-2.5 text-gray-700">{`Validated- ${'TODO'}`}</h4>
          <p className="mt-1 px-2 text-xs text-gray-500 text-center">{`Validators have signed the message bundle`}</p>
        </div>
        <div className="flex-0 w-5"></div>
        <div className="flex-1 flex flex-col items-center">
          <div className="w-full h-6 flex items-center justify-center bg-blue-500 rounded-r relative">
            <div className="w-3 h-3 rounded-full bg-white"></div>
            <div className="absolute -top-12 flex flex-col items-center">
              <StageIcon src={EnvelopeIcon} />
              <div className="w-0.5 h-4 bg-blue-500"></div>
            </div>
          </div>
          <h4 className="mt-2.5 text-gray-700">{`Relayed - ${'TODO'}`}</h4>
          <p className="mt-1 px-2 text-xs text-gray-500 text-center">{`Destination transaction has been confirmed`}</p>
        </div>
      </div>
    </Card>
  );
}

function StageIcon({ src, size }: { src: any; size?: number }) {
  return (
    <div className="h-9 w-9 flex items-center justify-center rounded-full bg-blue-500">
      <Image src={src} width={size ?? 14} height={size ?? 14} alt="" />
    </div>
  );
}
