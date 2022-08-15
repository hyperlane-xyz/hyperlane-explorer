import { ChainToChain } from '../../components/icons/ChainToChain';
import { Message, MessageStatus } from '../../types';
import { shortenAddress } from '../../utils/addresses';
import { getHumanReadableTimeString } from '../../utils/time';

export function MessageSummary({ message }: { message: Message }) {
  const {
    status,
    sender,
    recipient,
    originTimeSent,
    originChainId,
    destinationChainId,
  } = message;

  let statusColor = 'bg-beige-500';
  let statusText = 'Pending';
  if (status === MessageStatus.Delivered) {
    statusColor = 'bg-green-500 text-white';
    statusText = 'Delivered';
  } else if (status === MessageStatus.Failing) {
    statusColor = 'bg-red-500 text-white';
    statusText = 'Failing';
  }

  return (
    <div className="flex items-center justify-between space-x-5 sm:space-x-12 md:space-x-16">
      <ChainToChain
        originChainId={originChainId}
        destinationChainId={destinationChainId}
      />
      <div className="flex items-center justify-between flex-1">
        <div className={styles.valueContainer}>
          <div className={styles.label}>Sender</div>
          <div className={styles.value}>
            {shortenAddress(sender) || 'Invalid Address'}
          </div>
        </div>
        <div className="hidden sm:flex flex-col">
          <div className={styles.label}>Recipient</div>
          <div className={styles.value}>
            {shortenAddress(recipient) || 'Invalid Address'}
          </div>
        </div>
        <div className={styles.valueContainer + ' w-28'}>
          <div className={styles.label}>Time sent</div>
          <div className={styles.value}>
            {getHumanReadableTimeString(originTimeSent)}
          </div>
        </div>
      </div>
      <div
        className={`w-20 md:w-24 py-2 text-sm text-center rounded ${statusColor}`}
      >
        {statusText}
      </div>
    </div>
  );
}

const styles = {
  valueContainer: 'flex flex-col',
  label: 'text-sm text-gray-500',
  value: 'text-sm mt-1',
};
