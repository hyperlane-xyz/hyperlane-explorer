import { useRouter } from 'next/router';

import { ChainIcon } from '../../components/icons/ChainIcon';
import { MessageStatus, MessageStub } from '../../types';
import { shortenAddress } from '../../utils/addresses';
import { getChainDisplayName } from '../../utils/chains';
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
      <tr className="border-b border-gray-100">
        <th className={`${styles.header} xs:text-left pl-3 sm:pl-6`}>Origin</th>
        <th className={`${styles.header} xs:text-left pl-1 sm:pl-2`}>Destination</th>
        <th className={`${styles.header} hidden sm:table-cell`}>Sender</th>
        <th className={`${styles.header} hidden sm:table-cell`}>Recipient</th>
        <th className={styles.header}>Time sent</th>
        <th className={`${styles.header} hidden lg:table-cell`}>Duration</th>
        <th className={styles.header}>Status</th>
      </tr>
      {messageList.map((m) => (
        <tr
          key={`message-${m.id}`}
          className={`cursor-pointer hover:bg-gray-100 active:bg-gray-200 border-b border-gray-100 last:border-0 ${
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
      <td className="py-3.5">
        <div className="flex items-center pl-3 sm:pl-5">
          <ChainIcon chainId={originChainId} size={26} />
          <div className={styles.valueChainName}>{getChainDisplayName(originChainId, true)}</div>
        </div>
      </td>
      <td>
        <div className="flex items-center">
          <ChainIcon chainId={destinationChainId} size={26} />
          <div className={styles.valueChainName}>
            {getChainDisplayName(destinationChainId, true)}
          </div>
        </div>
      </td>
      <td className="hidden sm:table-cell">
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
  value: 'text-sm text-center px-1',
  valueChainName: 'text-sm ml-2',
  valueTruncated: 'text-sm text-center truncate',
};
