import { useRouter } from 'next/router';

import { ChainToChain } from '../../components/icons/ChainToChain';
import { MessageStatus, MessageStub } from '../../types';
import { shortenAddress } from '../../utils/addresses';
import { getHumanReadableDuration, getHumanReadableTimeString } from '../../utils/time';

export function MessageTable({
  messageList,
  isFetching,
}: {
  messageList: MessageStub[];
  isFetching: boolean;
}) {
  const router = useRouter();

  return (
    <table className="w-full mb-1">
      <tr className="px-2 py-2 sm:px-4 md:px-5 md:py-2.5 border-b border-gray-100 bg-gray-50">
        <th className={`${styles.header} pr-1`}>Chains</th>
        <th className={styles.header}>Sender</th>
        <th className={`${styles.header} hidden sm:table-cell`}>Recipient</th>
        <th className={styles.header}>Time Sent</th>
        <th className={`${styles.header} hidden lg:table-cell`}>Duration</th>
        <th className={styles.header}>Status</th>
      </tr>
      {messageList.map((m) => (
        <tr
          key={`message-${m.id}`}
          className={`px-2 py-2 sm:px-4 md:px-5 md:py-2.5 cursor-pointer hover:bg-gray-100 active:bg-gray-200 border-b border-gray-100 last:border-0 ${
            isFetching && 'blur-xs'
          } transition-all duration-500`}
          onClick={() => router.push(`/message/${m.id}`)}
        >
          <MessageSummaryRow message={m} />
        </tr>
      ))}
    </table>
  );
}

export function MessageSummaryRow({ message }: { message: MessageStub }) {
  const {
    status,
    sender,
    recipient,
    originChainId,
    destinationChainId,
    originTimestamp,
    destinationTimestamp,
  } = message;

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
    <>
      <td className="py-2.5">
        <ChainToChain
          originChainId={originChainId}
          destinationChainId={destinationChainId}
          size={38}
          arrowSize={30}
          isNarrow={true}
        />
      </td>
      <td>
        <div className={styles.value}>{shortenAddress(sender) || 'Invalid Address'}</div>
      </td>
      <td className="hidden sm:table-cell">
        <div className={styles.value}>{shortenAddress(recipient) || 'Invalid Address'}</div>
      </td>
      <td>
        <div className={styles.valueTruncated}>{getHumanReadableTimeString(originTimestamp)}</div>
      </td>
      <td className="hidden lg:table-cell text-center px-4">
        <div className={styles.valueTruncated}>
          {destinationTimestamp
            ? getHumanReadableDuration(destinationTimestamp - originTimestamp)
            : '-'}
        </div>
      </td>
      <td>
        <div className="flex items-center justify-center">
          <div className={`text-center w-20 md:w-[5.25rem] py-1.5 text-sm rounded ${statusColor}`}>
            {statusText}
          </div>
        </div>
      </td>
    </>
  );
}

const styles = {
  header: 'text-sm text-gray-700 font-normal pt-2 pb-3 text-center',
  value: 'text-sm text-center',
  valueTruncated: 'text-sm text-center truncate',
};
