import Image from 'next/image';
import Link from 'next/link';
import { PropsWithChildren } from 'react';

import { MultiProvider } from '@hyperlane-xyz/sdk';
import { shortenAddress } from '@hyperlane-xyz/utils';

import { ChainLogo } from '../../components/icons/ChainLogo';
import CheckmarkIcon from '../../images/icons/checkmark-circle.svg';
import ErrorIcon from '../../images/icons/error-circle.svg';
import { useMultiProvider } from '../../store';
import { MessageStatus, MessageStub } from '../../types';
import { getHumanReadableTimeString } from '../../utils/time';
import { getChainDisplayName } from '../chains/utils';

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
          <th className={`${styles.header} hidden lg:table-cell`}>Origin Tx</th>
          <th className={styles.header}>Time sent</th>
        </tr>
      </thead>
      <tbody>
        {messageList.map((m) => (
          <tr
            key={`message-${m.id}`}
            className={`relative cursor-pointer hover:bg-pink-50 active:bg-pink-100 border-b border-blue-50 last:border-0 ${
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
  const { msgId, status, sender, recipient, originChainId, destinationChainId, origin } = message;

  let statusIcon = undefined;
  let statusTitle = '';
  if (status === MessageStatus.Delivered) {
    statusIcon = CheckmarkIcon;
    statusTitle = 'Delivered';
  } else if (status === MessageStatus.Failing) {
    statusIcon = ErrorIcon;
    statusTitle = 'Failing';
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
      <LinkCell
        id={msgId}
        base64={base64}
        tdClasses="hidden lg:table-cell"
        aClasses={styles.valueTruncated}
      >
        {shortenAddress(origin.hash)}
      </LinkCell>
      <LinkCell id={msgId} base64={base64} aClasses={styles.valueTruncated} tdClasses="pr-4">
        {getHumanReadableTimeString(origin.timestamp)}
      </LinkCell>
      {statusIcon && (
        <LinkCell id={msgId} base64={base64} tdClasses="w-0">
          <span className="absolute right-4 top-1/2 transform -translate-y-1/2">
            <Image
              src={statusIcon}
              width={18}
              height={18}
              alt={statusTitle}
              title={statusTitle}
              className="pt-px"
            />
          </span>
        </LinkCell>
      )}
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
