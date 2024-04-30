import Link from 'next/link';
import { PropsWithChildren } from 'react';



import { MultiProvider } from '@hyperlane-xyz/sdk';
import { shortenAddress } from '@hyperlane-xyz/utils';

import { ChainLogo } from '../../components/icons/ChainLogo';
import TimeElapsed from '../../components/timer/TimeElapsed';
import { MessageStatus, MessageStub } from '../../types';
import { getHumanReadableDuration } from '../../utils/time';
import { getChainDisplayName } from '../chains/utils';
import { useMultiProvider } from '../providers/multiProvider';



import { serializeMessage } from './utils';

export function MessageTable({
  messageList,
  isFetching,
}: {
  messageList: MessageStub[];
  isFetching: boolean;
}) {
  const multiProvider = useMultiProvider();

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
            className={`cursor-pointer hover:bg-pink-50 active:bg-pink-100 border-b border-blue-50 last:border-0 ${
              isFetching && 'blur-xs'
            } transition-all duration-500`}
          >
            <MessageSummaryRow message={m} mp={multiProvider} />
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function MessageSummaryRow({ message, mp }: { message: MessageStub; mp: MultiProvider }) {
  const {
    msgId,
    status,
    sender,
    recipient,
    originChainId,
    destinationChainId,
    origin,
    destination,
  } = message;

  let statusColor = 'bg-blue-50 text-gray-700';
  let statusText = 'Pending';
  if (status === MessageStatus.Delivered) {
    statusColor = 'bg-[#14825d] text-white';
    statusText = 'Delivered';
  } else if (status === MessageStatus.Failing) {
    statusColor = 'bg-red-500 text-white';
    statusText = 'Failing';
  } else if (status === MessageStatus.Unknown) {
    statusColor = 'bg-gray-400 text-white';
    statusText = 'Unknown';
  }

  const base64 = message.isPiMsg ? serializeMessage(message) : undefined;

  return (
    <>
      <LinkCell id={msgId} base64={base64} aClasses="flex items-center py-3.5 pl-3 sm:pl-5">
        <ChainLogo chainId={originChainId} size={20} />
        <div className={styles.chainName}>{getChainDisplayName(mp, originChainId, true)}</div>
      </LinkCell>
      <LinkCell id={msgId} base64={base64} aClasses="flex items-center py-3.5 ">
        <ChainLogo chainId={destinationChainId} size={20} />
        <div className={styles.chainName}>{getChainDisplayName(mp, destinationChainId, true)}</div>
      </LinkCell>
      <LinkCell id={msgId} base64={base64} tdClasses="hidden sm:table-cell" aClasses={styles.value}>
        {shortenAddress(sender) || 'Invalid Address'}
      </LinkCell>
      <LinkCell id={msgId} base64={base64} tdClasses="hidden sm:table-cell" aClasses={styles.value}>
        {shortenAddress(recipient) || 'Invalid Address'}
      </LinkCell>
      <LinkCell id={msgId} base64={base64} aClasses={styles.valueTruncated}>
        <TimeElapsed timestamp={origin.timestamp} />
      </LinkCell>
      <LinkCell
        id={msgId}
        base64={base64}
        tdClasses="hidden lg:table-cell text-center px-4"
        aClasses={styles.valueTruncated}
      >
        {destination?.timestamp
          ? getHumanReadableDuration(destination.timestamp - origin.timestamp, 3)
          : '-'}
      </LinkCell>
      <LinkCell id={msgId} base64={base64} aClasses="flex items-center justify-center">
        <div
          className={`text-center w-20 md:w-[5.25rem] py-1.5 text-sm rounded-full ${statusColor}`}
        >
          {statusText}
        </div>
      </LinkCell>
    </>
  );
}

function LinkCell({
  id,
  base64,
  tdClasses,
  aClasses,
  children,
}: PropsWithChildren<{ id: string; base64?: string; tdClasses?: string; aClasses?: string }>) {
  const path = `/message/${id}`;
  const params = base64 ? `?data=${base64}` : '';
  return (
    <td className={tdClasses}>
      <Link href={`${path}${params}`} className={aClasses}>
        {children}
      </Link>
    </td>
  );
}

const styles = {
  header: 'text-sm text-blue-500 font-medium pt-2 pb-3 text-center',
  value: 'py-3.5 flex items-center justify-center text-sm text-center font-light px-1',
  valueTruncated: 'py-3.5 flex items-center justify-center text-sm text-center font-light truncate',
  chainName: 'text-sm font-light ml-2',
};