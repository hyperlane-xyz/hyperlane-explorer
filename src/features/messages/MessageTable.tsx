import type { ChainMetadataResolver } from '@hyperlane-xyz/sdk/metadata/ChainMetadataResolver';
import type { WarpRouteChainAddressMap } from '@hyperlane-xyz/sdk/warp/read';
import { isNullish, shortenAddress } from '@hyperlane-xyz/utils';
import Image from 'next/image';
import Link from 'next/link';
import { NextRouter, useRouter } from 'next/router';
import {
  PropsWithChildren,
  ReactNode,
  createContext,
  memo,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { ChainLogo } from '../../components/icons/ChainLogo';
import { CheckmarkIcon } from '../../components/icons/CheckmarkIcon';
import { TokenIcon } from '../../components/icons/TokenIcon';
import ErrorIcon from '../../images/icons/error-circle.svg';
import { useChainMetadataResolver, useStore } from '../../metadataStore';
import { Color } from '../../styles/Color';
import { MessageStatus, MessageStub } from '../../types';
import { formatAddress, formatTxHash } from '../../utils/addresses';
import { formatAmountCompact } from '../../utils/amount';
import { scheduleWhenIdle } from '../../utils/scheduleWhenIdle';
import { getHumanReadableTimeString } from '../../utils/time';
import { getChainDisplayName } from '../chains/utils';
import { prefetchMessageDetailShell } from './navigationPrefetch';
import { prefetchMessageStub } from './queries/prefetch';
import { parseWarpRouteMessageDetails, serializeMessage } from './utils';

const BACKGROUND_PREFETCH_COUNT = 5;
const TIME_SENT_REFRESH_MS = 1_000;
const RelativeTimeContext = createContext(0);

export function MessageTable({
  messageList,
  isFetching,
}: {
  messageList: MessageStub[];
  isFetching: boolean;
}) {
  const router = useRouter();
  const chainMetadataResolver = useChainMetadataResolver();
  const warpRouteChainAddressMap = useStore((s) => s.warpRouteChainAddressMap);
  const previousMessageIds = useRef<Set<string> | null>(null);
  const previousMessageStatuses = useRef<Map<string, MessageStatus>>(new Map());
  const insertedMessageTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const deliveredMessageTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const [insertedMessageIds, setInsertedMessageIds] = useState<Set<string>>(() => new Set());
  const [deliveredMessageIds, setDeliveredMessageIds] = useState<Set<string>>(() => new Set());
  const [timeRefreshKey, setTimeRefreshKey] = useState(0);
  const backgroundPrefetchKey = useMemo(() => {
    if (isFetching) return '';
    return messageList
      .slice(0, BACKGROUND_PREFETCH_COUNT)
      .map((message) => message.msgId.toLowerCase())
      .join(',');
  }, [isFetching, messageList]);

  useEffect(() => {
    if (!backgroundPrefetchKey) return;

    const messagesToPrefetch = messageList.slice(0, BACKGROUND_PREFETCH_COUNT);
    let cancelled = false;

    const prefetchTopRows = async () => {
      await prefetchMessageDetailShell();
      for (const message of messagesToPrefetch) {
        if (cancelled) return;
        prefetchMessageNavigation(router, message);
      }
    };

    const cancelIdleSchedule = scheduleWhenIdle(
      () => {
        void prefetchTopRows();
      },
      { timeout: 1_000, fallbackDelay: 250 },
    );

    return () => {
      cancelled = true;
      cancelIdleSchedule();
    };
  }, [backgroundPrefetchKey, messageList, router]);

  useEffect(() => {
    const currentIds = new Set(messageList.map((message) => message.id));
    const currentStatuses = new Map(messageList.map((message) => [message.id, message.status]));
    const previousIds = previousMessageIds.current;
    const previousStatuses = previousMessageStatuses.current;
    previousMessageIds.current = currentIds;
    previousMessageStatuses.current = currentStatuses;

    if (!previousIds) return;

    const newIds = [...currentIds].filter((id) => !previousIds.has(id));
    if (newIds.length) {
      setInsertedMessageIds((ids) => new Set([...ids, ...newIds]));
      newIds.forEach((id) => {
        const existingTimer = insertedMessageTimers.current.get(id);
        if (existingTimer) clearTimeout(existingTimer);

        const timer = setTimeout(() => {
          insertedMessageTimers.current.delete(id);
          setInsertedMessageIds((ids) => {
            const nextIds = new Set(ids);
            nextIds.delete(id);
            return nextIds;
          });
        }, 1_000);

        insertedMessageTimers.current.set(id, timer);
      });
    }

    const newlyDeliveredIds = messageList
      .filter(
        (message) =>
          previousStatuses.get(message.id) === MessageStatus.Pending &&
          message.status === MessageStatus.Delivered,
      )
      .map((message) => message.id);
    if (!newlyDeliveredIds.length) return;

    setDeliveredMessageIds((ids) => new Set([...ids, ...newlyDeliveredIds]));
    newlyDeliveredIds.forEach((id) => {
      const existingTimer = deliveredMessageTimers.current.get(id);
      if (existingTimer) clearTimeout(existingTimer);

      const timer = setTimeout(() => {
        deliveredMessageTimers.current.delete(id);
        setDeliveredMessageIds((ids) => {
          const nextIds = new Set(ids);
          nextIds.delete(id);
          return nextIds;
        });
      }, 1_000);

      deliveredMessageTimers.current.set(id, timer);
    });
  }, [messageList]);

  useEffect(
    () => () => {
      insertedMessageTimers.current.forEach((timer) => clearTimeout(timer));
      insertedMessageTimers.current.clear();
      deliveredMessageTimers.current.forEach((timer) => clearTimeout(timer));
      deliveredMessageTimers.current.clear();
    },
    [],
  );

  useEffect(() => {
    const timer = setInterval(() => setTimeRefreshKey((key) => key + 1), TIME_SENT_REFRESH_MS);
    return () => clearInterval(timer);
  }, []);

  return (
    <RelativeTimeContext.Provider value={timeRefreshKey}>
      <table className="mb-1 w-full">
        <thead>
          <tr className="border-b border-gray-100">
            <th className={`${styles.header} xs:text-left pl-3 sm:pl-6`}>Origin</th>
            <th className={`${styles.header} xs:text-left pl-1 sm:pl-2`}>Destination</th>
            <th className={`${styles.header} hidden sm:table-cell`}>Sender</th>
            <th className={`${styles.header} hidden sm:table-cell`}>Recipient</th>
            <th className={`${styles.header} hidden lg:table-cell`}>Origin Tx</th>
            <th className={styles.header}>Time sent</th>
            <th className={`${styles.header} hidden sm:table-cell`}>Warped Token</th>
          </tr>
        </thead>
        <tbody>
          {messageList.map((m) => {
            const isInserted = insertedMessageIds.has(m.id);
            const isDelivered = deliveredMessageIds.has(m.id);
            return (
              <tr
                key={`message-${m.id}`}
                className={`border-primary-50 hover:bg-accent-50 active:bg-accent-100 relative cursor-pointer border-b last:border-0 ${
                  isFetching && 'blur-xs'
                } ${
                  isInserted ? 'bg-primary-50 live-message-insert' : ''
                } ${isDelivered ? 'bg-[#dcfce7]' : ''} transition-all duration-500`}
              >
                <MessageSummaryRow
                  message={m}
                  chainMetadataResolver={chainMetadataResolver}
                  router={router}
                  warpRouteChainAddressMap={warpRouteChainAddressMap}
                />
              </tr>
            );
          })}
        </tbody>
      </table>
      <style jsx global>{`
        @keyframes live-message-insert {
          0% {
            opacity: 0;
            transform: translateY(-10px);
            box-shadow: inset 3px 0 0 ${Color.primaryDark};
          }
          35% {
            opacity: 1;
            transform: translateY(0);
            box-shadow: inset 3px 0 0 ${Color.primaryDark};
          }
          100% {
            opacity: 1;
            transform: translateY(0);
            box-shadow: inset 0 0 0 transparent;
          }
        }

        .live-message-insert {
          animation: live-message-insert 900ms ease-out;
        }
      `}</style>
    </RelativeTimeContext.Provider>
  );
}

export const MessageSummaryRow = memo(function MessageSummaryRow({
  message,
  chainMetadataResolver,
  router,
  warpRouteChainAddressMap,
}: {
  message: MessageStub;
  chainMetadataResolver: ChainMetadataResolver;
  router: NextRouter;
  warpRouteChainAddressMap: WarpRouteChainAddressMap;
}) {
  const { msgId, status, sender, recipient, originDomainId, destinationDomainId, origin } = message;

  const formattedSender = formatAddress(sender, originDomainId, chainMetadataResolver);
  const formattedRecipient = formatAddress(recipient, destinationDomainId, chainMetadataResolver);
  const formattedTxHash = formatTxHash(origin.hash, originDomainId, chainMetadataResolver);
  const hasPrimedDetailPage = useRef(false);

  useEffect(() => {
    hasPrimedDetailPage.current = false;
  }, [message.msgId]);

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
  } else if (status === MessageStatus.Pending) {
    statusTitle = 'Pending';
    statusIcon = (
      <span
        className="block h-3.5 w-3.5 animate-spin rounded-full border-[1.5px]"
        style={{
          borderColor: `${Color.primaryDark}33`,
          borderTopColor: Color.primaryDark,
        }}
        title={statusTitle}
      />
    );
  }

  const base64 = message.isPiMsg ? serializeMessage(message) : undefined;
  const detailPath = `/message/${msgId}`;
  const primeDetailPage = () => {
    if (hasPrimedDetailPage.current) return;
    hasPrimedDetailPage.current = true;
    prefetchMessageNavigation(router, message);
  };

  const originChainName = chainMetadataResolver.tryGetChainName(originDomainId) || 'Unknown';
  const destinationChainName =
    chainMetadataResolver.tryGetChainName(destinationDomainId) || 'Unknown';
  const warpRouteDetails = useMemo(
    () => parseWarpRouteMessageDetails(message, warpRouteChainAddressMap, chainMetadataResolver),
    [message, warpRouteChainAddressMap, chainMetadataResolver],
  );
  const isDifferentWarpToken = warpRouteDetails
    ? warpRouteDetails.originToken.symbol !== warpRouteDetails.destinationToken.symbol ||
      warpRouteDetails.originToken.logoURI !== warpRouteDetails.destinationToken.logoURI
    : false;
  const showDestInTooltip = isDifferentWarpToken || !isNullish(warpRouteDetails?.destAmount);
  const warpTooltipContent = warpRouteDetails
    ? `${formatAmountCompact(warpRouteDetails.amount)} ${warpRouteDetails.originToken.symbol}${
        showDestInTooltip
          ? ` → ${formatAmountCompact(warpRouteDetails.destAmount ?? warpRouteDetails.amount)} ${warpRouteDetails.destinationToken.symbol}`
          : ''
      }`
    : '';
  return (
    <>
      <LinkCell
        path={detailPath}
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
        path={detailPath}
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
        path={detailPath}
        base64={base64}
        tdClasses="hidden sm:table-cell"
        aClasses={styles.value}
        onNavigateIntent={primeDetailPage}
      >
        {shortenAddress(formattedSender) || 'Invalid Address'}
      </LinkCell>
      <LinkCell
        path={detailPath}
        base64={base64}
        tdClasses="hidden sm:table-cell"
        aClasses={styles.value}
        onNavigateIntent={primeDetailPage}
      >
        {shortenAddress(formattedRecipient) || 'Invalid Address'}
      </LinkCell>
      <LinkCell
        path={detailPath}
        base64={base64}
        tdClasses="hidden lg:table-cell"
        aClasses={styles.valueTruncated}
        onNavigateIntent={primeDetailPage}
      >
        {shortenAddress(formattedTxHash)}
      </LinkCell>
      <LinkCell
        path={detailPath}
        base64={base64}
        aClasses={styles.valueTruncated}
        onNavigateIntent={primeDetailPage}
      >
        <RelativeTime timestamp={origin.timestamp} />
      </LinkCell>
      <LinkCell
        path={detailPath}
        base64={base64}
        aClasses={`flex items-center py-2.5 ${warpRouteDetails ? 'ml-4' : 'justify-center'}`}
        tdClasses="hidden sm:table-cell"
        onNavigateIntent={primeDetailPage}
      >
        {warpRouteDetails ? (
          <>
            {isDifferentWarpToken ? (
              <div className="relative flex-shrink-0" style={{ width: 26, height: 20 }}>
                <div className="absolute left-0" style={{ top: -1 }}>
                  <TokenIcon token={warpRouteDetails.originToken} size={16} />
                </div>
                <div
                  className="absolute right-0 rounded-full ring-1 ring-white"
                  style={{ bottom: -1 }}
                >
                  <TokenIcon token={warpRouteDetails.destinationToken} size={16} />
                </div>
              </div>
            ) : (
              <TokenIcon token={warpRouteDetails.originToken} size={20} />
            )}
            <div
              className={styles.iconText}
              data-tooltip-id="root-tooltip"
              data-tooltip-content={warpTooltipContent}
            >
              {formatAmountCompact(warpRouteDetails.amount)} {warpRouteDetails.originToken.symbol}
            </div>
          </>
        ) : null}
      </LinkCell>
      <LinkCell
        path={detailPath}
        base64={base64}
        tdClasses="w-8"
        onNavigateIntent={primeDetailPage}
      >
        {statusIcon && (
          <span className="flex h-[18px] w-[18px] items-center justify-center" title={statusTitle}>
            {statusIcon}
          </span>
        )}
      </LinkCell>
    </>
  );
});

const RelativeTime = memo(function RelativeTime({ timestamp }: { timestamp: number }) {
  useContext(RelativeTimeContext);

  return <>{getHumanReadableTimeString(timestamp)}</>;
});

function LinkCell({
  path,
  base64,
  tdClasses,
  aClasses,
  onNavigateIntent,
  children,
}: PropsWithChildren<{
  path: string;
  base64?: string;
  tdClasses?: string;
  aClasses?: string;
  onNavigateIntent?: () => void;
}>) {
  const params = base64 ? `?data=${base64}` : '';
  return (
    <td className={tdClasses}>
      <Link
        href={`${path}${params}`}
        prefetch={false}
        className={`block h-full w-full ${aClasses || ''}`}
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

function prefetchMessageNavigation(router: NextRouter, message: MessageStub) {
  const detailPath = `/message/${message.msgId}`;
  void router.prefetch(detailPath);
  void prefetchMessageDetailShell();
  prefetchMessageStub(message);
}
