import { ChainToChain } from '../../components/icons/ChainToChain';
import { Card } from '../../components/layout/Card';
import { MOCK_MESSAGES } from '../../test/mockMessages';
import { MessageStatus } from '../../types';
import { shortenAddress } from '../../utils/addresses';
import { getHumanReadableTimeString } from '../../utils/time';

export function MessageDetails({ messageId }: { messageId: string }) {
  const {
    status,
    sender,
    recipient,
    originTimeSent,
    originChainId,
    destinationChainId,
  } = MOCK_MESSAGES[0];

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
    <div className="flex flex-wrap items-center justify-between">
      <Card>
        <div>c1</div>
      </Card>
      <Card>
        <div>c1</div>
      </Card>
      <Card>
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
      </Card>
    </div>
  );
}

const styles = {
  valueContainer: 'flex flex-col',
  label: 'text-sm text-gray-500',
  value: 'text-sm mt-1',
};
