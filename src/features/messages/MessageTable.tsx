import { MultiProvider } from '@hyperlane-xyz/sdk';
import { shortenAddress } from '@hyperlane-xyz/utils';
import { Tooltip } from '@hyperlane-xyz/widgets';
import Image from 'next/image';
import Link from 'next/link';
import { PropsWithChildren, useMemo } from 'react';
import { ChainLogo } from '../../components/icons/ChainLogo';
import { TokenIcon } from '../../components/icons/TokenIcon';
import CheckmarkIcon from '../../images/icons/checkmark-circle.svg';
import ErrorIcon from '../../images/icons/error-circle.svg';
import { useMultiProvider, useStore } from '../../store';
import { MessageStatus, MessageStub, WarpRouteChainAddressMap } from '../../types';
import { getHumanReadableTimeString } from '../../utils/time';
import { getChainDisplayName } from '../chains/utils';
import { parseWarpRouteMessageDetails, serializeMessage } from './utils';

export function MessageTable({
  messageList,
  isFetching,
}: {
  messageList: MessageStub[];
  isFetching: boolean;
}) {
  const multiProvider = useMultiProvider();
  const warpRouteChainAddressMap = useStore((s) => s.warpRouteChainAddressMap);

  return (
    <table className="mb-1 w-full">
      <thead>
        <tr className="border-b border-gray-100">
          <th className={`${styles.header} pl-3 xs:text-left sm:pl-6`}>Origin</th>
          <th className={`${styles.header} pl-1 xs:text-left sm:pl-2`}>Destination</th>
          <th className={`${styles.header} hidden sm:table-cell`}>Sender</th>
          <th className={`${styles.header} hidden sm:table-cell`}>Recipient</th>
          <th className={`${styles.header} hidden lg:table-cell`}>Origin Tx</th>
          <th className={`${styles.header} hidden sm:table-cell`}>Warped Token</th>
          <th className={styles.header}>Time sent</th>
        </tr>
      </thead>
      <tbody>
        {messageList.map((m) => (
          <tr
            key={`message-${m.id}`}
            className={`relative cursor-pointer border-b border-blue-50 last:border-0 hover:bg-pink-50 active:bg-pink-100 ${
              isFetching && 'blur-xs'
            } transition-all duration-500`}
          >
            <MessageSummaryRow
              message={m}
              mp={multiProvider}
              warpRouteChainAddressMap={warpRouteChainAddressMap}
            />
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function MessageSummaryRow({
  message,
  mp,
  warpRouteChainAddressMap,
}: {
  message: MessageStub;
  mp: MultiProvider;
  warpRouteChainAddressMap: WarpRouteChainAddressMap;
}) {
  const { msgId, status, sender, recipient, originDomainId, destinationDomainId, origin } = message;

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

  const originChainName = mp.tryGetChainName(originDomainId) || 'Unknown';
  const destinationChainName = mp.tryGetChainName(destinationDomainId) || 'Unknown';
  const warpRouteDetails = useMemo(
    () => parseWarpRouteMessageDetails(message, warpRouteChainAddressMap, mp),
    [message, warpRouteChainAddressMap, mp],
  );

  return (
    <>
      <LinkCell id={msgId} base64={base64} aClasses="flex items-center py-3.5 pl-3 sm:pl-5">
        <ChainLogo chainName={originChainName} size={20} />
        <div className={styles.chainName}>{getChainDisplayName(mp, originChainName, true)}</div>
      </LinkCell>
      <LinkCell id={msgId} base64={base64} aClasses="flex items-center py-3.5">
        <ChainLogo chainName={destinationChainName} size={20} />
        <div className={styles.chainName}>
          {getChainDisplayName(mp, destinationChainName, true)}
        </div>
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
      <LinkCell
        id={msgId}
        base64={base64}
        aClasses={styles.valueTruncated}
        tdClasses="hidden sm:table-cell flex items-center"
      >
        {warpRouteDetails ? (
          <>
            <TokenIcon token={warpRouteDetails.originToken} size={20} />
            <div className={styles.chainName}>{warpRouteDetails.originToken.symbol}</div>
          </>
        ) : (
          <Tooltip
            content="Unable to derive token from transfer. Message might not be a Hyperlane warp route token transfer."
            id="no-token-info"
            tooltipClassName="whitespace-normal break-words text-left"
          />
        )}
      </LinkCell>
      <LinkCell id={msgId} base64={base64} aClasses={styles.valueTruncated}>
        {getHumanReadableTimeString(origin.timestamp)}
      </LinkCell>
      <LinkCell id={msgId} base64={base64} tdClasses="w-8">
        {statusIcon && (
          <span>
            <Image
              src={statusIcon}
              width={18}
              height={18}
              alt={statusTitle}
              title={statusTitle}
              className="pt-px"
            />
          </span>
        )}
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
