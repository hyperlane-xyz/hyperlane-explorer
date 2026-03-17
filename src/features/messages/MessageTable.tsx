import { shortenAddress } from '@hyperlane-xyz/utils';
import Image from 'next/image';
import Link from 'next/link';
import { PropsWithChildren, ReactNode, memo, useEffect, useMemo, useRef } from 'react';
import { ChainLogo } from '../../components/icons/ChainLogo';
import { CheckmarkIcon } from '../../components/icons/CheckmarkIcon';
import { TokenIcon } from '../../components/icons/TokenIcon';
import ErrorIcon from '../../images/icons/error-circle.svg';
import { useChainMetadataResolver, useStore } from '../../metadataStore';
import { Color } from '../../styles/Color';
import { MessageStatus, MessageStub, WarpRouteChainAddressMap } from '../../types';
import { formatAddress, formatTxHash } from '../../utils/addresses';
import { formatAmountCompact } from '../../utils/amount';
import { getHumanReadableTimeString } from '../../utils/time';
import type { ChainMetadataResolver } from '../chains/metadataManager';
import { useScrapedDomains } from '../chains/queries/useScrapedChains';
import { getChainDisplayName } from '../chains/utils';
import { prefetchMessageDetails, prefetchMessageStub } from './queries/prefetch';
import { parseWarpRouteMessageDetails, serializeMessage } from './utils';

export function MessageTable({
  messageList,
  isFetching,
}: {
  messageList: MessageStub[];
  isFetching: boolean;
}) {
  const chainMetadataResolver = useChainMetadataResolver();
  const warpRouteChainAddressMap = useStore((s) => s.warpRouteChainAddressMap);
  const { scrapedDomains } = useScrapedDomains();

  return (
    <table className="mb-1 w-full">
      <thead>
        <tr className="border-b border-gray-100">
          <th className={`${styles.header} pl-3 xs:text-left sm:pl-6`}>Origin</th>
          <th className={`${styles.header} pl-1 xs:text-left sm:pl-2`}>Destination</th>
          <th className={`${styles.header} hidden sm:table-cell`}>Sender</th>
          <th className={`${styles.header} hidden sm:table-cell`}>Recipient</th>
          <th className={`${styles.header} hidden lg:table-cell`}>Origin Tx</th>
          <th className={styles.header}>Time sent</th>
          <th className={`${styles.header} hidden sm:table-cell`}>Warped Token</th>
        </tr>
      </thead>
      <tbody>
        {messageList.map((m) => (
          <tr
            key={`message-${m.id}`}
            className={`relative cursor-pointer border-b border-primary-50 last:border-0 hover:bg-accent-50 active:bg-accent-100 ${
              isFetching && 'blur-xs'
            } transition-all duration-500`}
          >
            <MessageSummaryRow
              message={m}
              chainMetadataResolver={chainMetadataResolver}
              scrapedChains={scrapedDomains}
              warpRouteChainAddressMap={warpRouteChainAddressMap}
            />
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export const MessageSummaryRow = memo(function MessageSummaryRow({
  message,
  chainMetadataResolver,
  scrapedChains,
  warpRouteChainAddressMap,
}: {
  message: MessageStub;
  chainMetadataResolver: ChainMetadataResolver;
  scrapedChains: ReturnType<typeof useScrapedDomains>['scrapedDomains'];
  warpRouteChainAddressMap: WarpRouteChainAddressMap;
}) {
  const { msgId, status, sender, recipient, originDomainId, destinationDomainId, origin } = message;

  const formattedSender = formatAddress(sender, originDomainId, chainMetadataResolver);
  const formattedRecipient = formatAddress(recipient, destinationDomainId, chainMetadataResolver);
  const formattedTxHash = formatTxHash(origin.hash, originDomainId, chainMetadataResolver);
  const hasPrimedDetailPage = useRef(false);

  useEffect(() => {
    hasPrimedDetailPage.current = false;
  }, [chainMetadataResolver, message.msgId, scrapedChains]);

  let statusIcon: ReactNode = null;
  let statusTitle = '';
  if (status === MessageStatus.Delivered) {
    statusIcon = (
      <CheckmarkIcon width={18} height={18} color={Color.primaryDark} className="pt-px" />
    );
    statusTitle = 'Delivered';
  } else if (status === MessageStatus.Failing) {
    statusTitle = 'Failing';
    statusIcon = (
      <Image
        src={ErrorIcon}
        width={18}
        height={18}
        alt={statusTitle}
        title={statusTitle}
        className="pt-px"
      />
    );
  }

  const base64 = message.isPiMsg ? serializeMessage(message) : undefined;
  const primeDetailPage = () => {
    if (hasPrimedDetailPage.current) return;
    hasPrimedDetailPage.current = true;
    prefetchMessageStub(message);

    if (message.isPiMsg || !scrapedChains.length) return;

    void prefetchMessageDetails(message.msgId, chainMetadataResolver, scrapedChains);
  };

  const originChainName = chainMetadataResolver.tryGetChainName(originDomainId) || 'Unknown';
  const destinationChainName =
    chainMetadataResolver.tryGetChainName(destinationDomainId) || 'Unknown';
  const warpRouteDetails = useMemo(
    () => parseWarpRouteMessageDetails(message, warpRouteChainAddressMap, chainMetadataResolver),
    [message, warpRouteChainAddressMap, chainMetadataResolver],
  );
  return (
    <>
      <LinkCell
        id={msgId}
        base64={base64}
        aClasses="flex items-center py-2.5 pl-3 sm:pl-5"
        onNavigateIntent={primeDetailPage}
      >
        <ChainLogo chainName={originChainName} size={20} />
        <div className={styles.iconText}>
          {getChainDisplayName(chainMetadataResolver, originChainName, true)}
        </div>
      </LinkCell>
      <LinkCell
        id={msgId}
        base64={base64}
        aClasses="flex items-center py-2.5"
        onNavigateIntent={primeDetailPage}
      >
        <ChainLogo chainName={destinationChainName} size={20} />
        <div className={styles.iconText}>
          {getChainDisplayName(chainMetadataResolver, destinationChainName, true)}
        </div>
      </LinkCell>
      <LinkCell
        id={msgId}
        base64={base64}
        tdClasses="hidden sm:table-cell"
        aClasses={styles.value}
        onNavigateIntent={primeDetailPage}
      >
        {shortenAddress(formattedSender) || 'Invalid Address'}
      </LinkCell>
      <LinkCell
        id={msgId}
        base64={base64}
        tdClasses="hidden sm:table-cell"
        aClasses={styles.value}
        onNavigateIntent={primeDetailPage}
      >
        {shortenAddress(formattedRecipient) || 'Invalid Address'}
      </LinkCell>
      <LinkCell
        id={msgId}
        base64={base64}
        tdClasses="hidden lg:table-cell"
        aClasses={styles.valueTruncated}
        onNavigateIntent={primeDetailPage}
      >
        {shortenAddress(formattedTxHash)}
      </LinkCell>
      <LinkCell
        id={msgId}
        base64={base64}
        aClasses={styles.valueTruncated}
        onNavigateIntent={primeDetailPage}
      >
        {getHumanReadableTimeString(origin.timestamp)}
      </LinkCell>
      <LinkCell
        id={msgId}
        base64={base64}
        aClasses={`flex items-center py-2.5 ${warpRouteDetails ? 'ml-4' : 'justify-center'}`}
        tdClasses="hidden sm:table-cell"
        onNavigateIntent={primeDetailPage}
      >
        {warpRouteDetails ? (
          <>
            <TokenIcon token={warpRouteDetails.originToken} size={20} />
            <div
              className={styles.iconText}
              data-tooltip-id="root-tooltip"
              data-tooltip-content={`${warpRouteDetails.amount} ${warpRouteDetails.originToken.symbol}`}
            >
              {formatAmountCompact(warpRouteDetails.amount)} {warpRouteDetails.originToken.symbol}
            </div>
          </>
        ) : null}
      </LinkCell>
      <LinkCell id={msgId} base64={base64} tdClasses="w-8" onNavigateIntent={primeDetailPage}>
        {statusIcon && <span title={statusTitle}>{statusIcon}</span>}
      </LinkCell>
    </>
  );
});

function LinkCell({
  id,
  base64,
  tdClasses,
  aClasses,
  onNavigateIntent,
  children,
}: PropsWithChildren<{
  id: string;
  base64?: string;
  tdClasses?: string;
  aClasses?: string;
  onNavigateIntent?: () => void;
}>) {
  const path = `/message/${id}`;
  const params = base64 ? `?data=${base64}` : '';
  return (
    <td className={tdClasses}>
      <Link
        href={`${path}${params}`}
        prefetch={true}
        className={aClasses}
        onMouseEnter={onNavigateIntent}
        onFocus={onNavigateIntent}
        onTouchStart={onNavigateIntent}
        onClick={onNavigateIntent}
      >
        {children}
      </Link>
    </td>
  );
}

const styles = {
  header: 'text-sm text-primary-800 font-medium pt-2 pb-3 text-center',
  value: 'py-2.5 flex items-center justify-center text-sm text-center font-light px-1',
  valueTruncated: 'py-2.5 flex items-center justify-center text-sm text-center font-light truncate',
  iconText: 'text-sm font-light ml-2',
};
