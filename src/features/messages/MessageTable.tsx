import Link from 'next/link';
import { PropsWithChildren } from 'react';

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
  return (
    <table className="w-full mb-1">
      <thead>
        <tr className="border-b border-gray-100">
          <th className={`${styles.header} xs:text-left pl-3 sm:pl-6`}>Origin</th>
          <th className={`${styles.header} xs:text-left pl-1 sm:pl-2`}>Destination</th>
          <th className={`${styles.header} hidden sm:table-cell`}>Sender</th>
          <th className={`${styles.header} hidden sm:table-cell`}>Recipient</th>
          <th className={styles.header}>Time sent</th>
          <th className={`${styles.header} hidden lg:table-cell`}>Duration</th>
          <th className={styles.header}>Status</th>
        </tr>
      </thead>
      <tbody>
        {messageList.map((m) => (
          <tr
            key={`message-${m.id}`}
            className={`cursor-pointer hover:bg-gray-100 active:bg-gray-200 border-b border-gray-100 last:border-0 ${
              isFetching && 'blur-xs'
            } transition-all duration-500`}
          >
            <MessageSummaryRow message={m} />
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function MessageSummaryRow({ message }: { message: MessageStub }) {
  const {
    msgId,
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
      <LinkCell id={msgId} aClasses="flex items-center py-3.5 pl-3 sm:pl-5">
        <ChainIcon chainId={originChainId} size={20} />
        <div className={styles.chainName}>{getChainDisplayName(originChainId, true)}</div>
      </LinkCell>
      <LinkCell id={msgId} aClasses="flex items-center py-3.5 ">
        <ChainIcon chainId={destinationChainId} size={20} />
        <div className={styles.chainName}>{getChainDisplayName(destinationChainId, true)}</div>
      </LinkCell>
      <LinkCell id={msgId} tdClasses="hidden sm:table-cell" aClasses={styles.value}>
        {shortenAddress(sender) || 'Invalid Address'}
      </LinkCell>
      <LinkCell id={msgId} tdClasses="hidden sm:table-cell" aClasses={styles.value}>
        {shortenAddress(recipient) || 'Invalid Address'}
      </LinkCell>
      <LinkCell id={msgId} aClasses={styles.valueTruncated}>
        {getHumanReadableTimeString(originTimestamp)}
      </LinkCell>
      <LinkCell
        id={msgId}
        tdClasses="hidden lg:table-cell text-center px-4"
        aClasses={styles.valueTruncated}
      >
        {destinationTimestamp
          ? getHumanReadableDuration(destinationTimestamp - originTimestamp, 3)
          : '-'}
      </LinkCell>
      <LinkCell id={msgId} aClasses="flex items-center justify-center">
        <div className={`text-center w-20 md:w-[5.25rem] py-1.5 text-sm rounded ${statusColor}`}>
          {statusText}
        </div>
      </LinkCell>
    </>
  );
}

function LinkCell({
  id,
  tdClasses,
  aClasses,
  children,
}: PropsWithChildren<{ id: string; tdClasses?: string; aClasses?: string }>) {
  return (
    <td className={tdClasses}>
      <Link href={`/message/${id}`} className={aClasses}>
        {children}
      </Link>
    </td>
  );
}

const styles = {
  header: 'text-sm text-gray-700 font-normal pt-2 pb-3 text-center',
  value: 'py-3.5 flex items-center justify-center text-sm text-center px-1',
  valueTruncated: 'py-3.5 flex items-center justify-center text-sm text-center truncate',
  chainName: 'text-sm ml-2',
};
