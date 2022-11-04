import Link from 'next/link';

import { ChainToChain } from '../../components/icons/ChainToChain';
import { MessageStatus, MessageStub } from '../../types';
import { shortenAddress } from '../../utils/addresses';
import { getHumanReadableTimeString } from '../../utils/time';

export function MessageSummary({ message }: { message: MessageStub }) {
  const { id, status, sender, recipient, timestamp, originChainId, destinationChainId } = message;

  let statusColor = 'bg-beige-500';
  let statusText = 'Pending';
  if (status === MessageStatus.Delivered) {
    statusColor = 'bg-green-400 text-white';
    statusText = 'Delivered';
  } else if (status === MessageStatus.Failing) {
    statusColor = 'bg-red-500 text-white';
    statusText = 'Failing';
  }

  return (
    <Link href={`/message/${id}`}>
      <a className="flex items-center justify-between space-x-4 xs:space-x-9 sm:space-x-12 md:space-x-16">
        <ChainToChain
          originChainId={originChainId}
          destinationChainId={destinationChainId}
          size={40}
          arrowSize={30}
          isNarrow={true}
        />
        <div className="flex items-center justify-between flex-1">
          <div className="flex flex-col">
            <div className={styles.label}>Sender</div>
            <div className={styles.value}>{shortenAddress(sender) || 'Invalid Address'}</div>
          </div>
          <div className="hidden sm:flex flex-col">
            <div className={styles.label}>Recipient</div>
            <div className={styles.value}>{shortenAddress(recipient) || 'Invalid Address'}</div>
          </div>
          <div className="flex flex-col sm:w-28">
            <div className={styles.label}>Time sent</div>
            <div className={styles.value}>{getHumanReadableTimeString(timestamp)}</div>
          </div>
          <div className="hidden lg:flex flex-col sm:w-16">
            <div className={styles.label}>Duration</div>
            <div className={styles.value}>{Math.floor((Date.now() - timestamp) / 1000)}</div>
          </div>
        </div>
        <div className={`w-20 md:w-[5.5rem] py-2 text-sm text-center rounded ${statusColor}`}>
          {statusText}
        </div>
      </a>
    </Link>
  );
}

const styles = {
  label: 'text-sm text-gray-500',
  value: 'text-sm mt-1',
};
