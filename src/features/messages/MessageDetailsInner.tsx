import { toTitleCase } from '@hyperlane-xyz/utils';
import { SpinnerIcon } from '@hyperlane-xyz/widgets';
import dynamic from 'next/dynamic';
import { startTransition, useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import { CheckmarkIcon } from '../../components/icons/CheckmarkIcon';
import { useMultiProvider, useStore } from '../../store';
import { Color } from '../../styles/Color';
import { Message, MessageStatus, MessageStub } from '../../types';
import { logger } from '../../utils/logger';
import { getHumanReadableDuration } from '../../utils/time';
import { getChainDisplayName, isEvmChain } from '../chains/utils';
import { useMessageDeliveryStatus } from '../deliveryStatus/useMessageDeliveryStatus';
import { DetailCardSkeleton, DetailSectionSkeleton } from './MessageDetailsLoading';
import { DestinationTransactionCard, OriginTransactionCard } from './cards/TransactionCard';
import { useIsIcaMessage } from './ica';
import { usePiChainMessageQuery } from './pi-queries/usePiChainMessageQuery';
import { PLACEHOLDER_MESSAGE } from './placeholderMessages';
import { useMessageQuery } from './queries/useMessageQuery';
import { parseWarpRouteMessageDetails } from './utils';

const ContentDetailsCard = dynamic(
  () => import('./cards/ContentDetailsCard').then((mod) => mod.ContentDetailsCard),
  { loading: () => <DetailSectionSkeleton className="w-full" rows={4} /> },
);
const GasDetailsCard = dynamic(
  () => import('./cards/GasDetailsCard').then((mod) => mod.GasDetailsCard),
  {
    loading: () => <DetailSectionSkeleton className="w-full" rows={3} />,
  },
);
const IsmDetailsCard = dynamic(
  () => import('./cards/IsmDetailsCard').then((mod) => mod.IsmDetailsCard),
  {
    loading: () => <DetailSectionSkeleton className="w-full" rows={3} />,
  },
);
const IcaDetailsCard = dynamic(
  () => import('./cards/IcaDetailsCard').then((mod) => mod.IcaDetailsCard),
  {
    loading: () => <DetailSectionSkeleton className="w-full" rows={3} />,
  },
);
const WarpTransferDetailsCard = dynamic(
  () => import('./cards/WarpTransferDetailsCard').then((mod) => mod.WarpTransferDetailsCard),
  { loading: () => <DetailSectionSkeleton className="w-full" rows={4} /> },
);
const TimelineCard = dynamic(() => import('./cards/TimelineCard').then((mod) => mod.TimelineCard), {
  loading: () => <DetailCardSkeleton className="w-full !bg-transparent !shadow-none" />,
});
const WarpRouteVisualizationCard = dynamic(
  () => import('./cards/WarpRouteVisualizationCard').then((mod) => mod.WarpRouteVisualizationCard),
  { loading: () => <DetailCardSkeleton className="w-full" /> },
);

interface Props {
  messageId: string;
  message?: Message | MessageStub;
}

export function MessageDetailsInner({ messageId, message: messageFromUrlParams }: Props) {
  const multiProvider = useMultiProvider();
  const ensureWarpRouteData = useStore((s) => s.ensureWarpRouteData);
  const isWarpRouteDataLoaded = useStore((s) => s.isWarpRouteDataLoaded);
  const [showExtendedCards, setShowExtendedCards] = useState(false);
  const hasDetailedUrlMessage = hasFullMessageDetails(messageFromUrlParams);

  const {
    isFetching: isGraphQlFetching,
    isError: isGraphQlError,
    hasRun: hasGraphQlRun,
    isMessageFound: isGraphQlMessageFound,
    message: messageFromGraphQl,
  } = useMessageQuery({ messageId, pause: hasDetailedUrlMessage });

  const {
    isError: isPiError,
    isFetching: isPiFetching,
    message: messageFromPi,
    isMessageFound: isPiMessageFound,
  } = usePiChainMessageQuery({
    messageId,
    pause: hasDetailedUrlMessage || !hasGraphQlRun || isGraphQlMessageFound,
  });

  const fetchedMessage = messageFromGraphQl || messageFromPi;
  const _message =
    (hasDetailedUrlMessage ? messageFromUrlParams : fetchedMessage || messageFromUrlParams) ||
    PLACEHOLDER_MESSAGE;
  const isMessageFound = !!messageFromUrlParams || isGraphQlMessageFound || isPiMessageFound;
  const isFetching = isGraphQlFetching || isPiFetching;
  const isError = isGraphQlError || isPiError;
  const blur = !isMessageFound;
  const isIcaMsg = useIsIcaMessage(_message);

  const {
    messageWithDeliveryStatus: message,
    debugResult,
    isDeliveryStatusFetching,
  } = useMessageDeliveryStatus({
    message: _message,
    enabled: isMessageFound,
  });

  const { status, originDomainId, destinationDomainId, origin, destination, isPiMsg } = message;

  const duration = destination?.timestamp
    ? getHumanReadableDuration(destination.timestamp - origin.timestamp, 3)
    : undefined;

  const showTimeline =
    !isPiMsg &&
    'blockNumber' in origin &&
    isEvmChain(multiProvider, originDomainId) &&
    isEvmChain(multiProvider, destinationDomainId);

  useDynamicBannerColor(isFetching, status, isMessageFound, isError || isPiError);

  const originChainName = multiProvider.tryGetChainName(originDomainId) || 'Unknown';
  const destinationChainName = multiProvider.tryGetChainName(destinationDomainId) || 'Unknown';

  const warpRouteChainAddressMap = useStore((s) => s.warpRouteChainAddressMap);

  useEffect(() => {
    if (isWarpRouteDataLoaded || !isMessageFound) return;
    ensureWarpRouteData().catch((e) => logger.error('Error loading warp route data', e));
  }, [ensureWarpRouteData, isMessageFound, isWarpRouteDataLoaded]);

  useEffect(() => {
    setShowExtendedCards(false);

    const reveal = () => {
      startTransition(() => setShowExtendedCards(true));
    };

    if (typeof window === 'undefined') return;

    if ('requestIdleCallback' in window) {
      const idleWindow = window as Window &
        typeof globalThis & {
          requestIdleCallback: typeof window.requestIdleCallback;
          cancelIdleCallback: typeof window.cancelIdleCallback;
        };
      const idleId = idleWindow.requestIdleCallback(reveal, { timeout: 700 });
      return () => idleWindow.cancelIdleCallback(idleId);
    }

    const timeoutId = globalThis.setTimeout(reveal, 150);
    return () => globalThis.clearTimeout(timeoutId);
  }, [messageId]);

  const warpRouteDetails = useMemo(
    () => parseWarpRouteMessageDetails(message, warpRouteChainAddressMap, multiProvider),
    [message, warpRouteChainAddressMap, multiProvider],
  );

  return (
    <>
      <div className="flex items-center justify-between rounded bg-accent-gradient px-3 py-3 shadow-accent-glow">
        <div className="flex items-center gap-2">
          <div className="h-2.5 w-2.5 rounded-full bg-cream-300" />
          <h2 className="text-lg font-medium text-white">{`${
            isIcaMsg ? 'ICA ' : ''
          }Message to ${getChainDisplayName(multiProvider, destinationChainName)}`}</h2>
        </div>
        <StatusHeader
          messageStatus={status}
          isMessageFound={isMessageFound}
          isFetching={isFetching}
          isError={isError}
          duration={duration}
        />
      </div>
      <div className="mt-3 flex flex-wrap items-stretch justify-between gap-3 md:mt-4 md:gap-4">
        <OriginTransactionCard
          chainName={originChainName}
          domainId={originDomainId}
          transaction={origin}
          blur={blur}
        />
        <DestinationTransactionCard
          chainName={destinationChainName}
          domainId={destinationDomainId}
          status={status}
          transaction={destination}
          debugResult={debugResult}
          isStatusFetching={isDeliveryStatusFetching}
          isPiMsg={isPiMsg}
          blur={blur}
          message={message}
          warpRouteDetails={warpRouteDetails}
        />
        <ContentDetailsCard message={message} blur={blur} />
        {showExtendedCards ? (
          <>
            {showTimeline && <TimelineCard message={message} blur={blur} />}
            <WarpTransferDetailsCard
              message={message}
              warpRouteDetails={warpRouteDetails}
              blur={blur}
            />
            <WarpRouteVisualizationCard
              message={message}
              warpRouteDetails={warpRouteDetails}
              blur={blur}
            />
            <GasDetailsCard
              message={message}
              igpPayments={debugResult?.gasDetails?.contractToPayments}
              blur={blur}
            />
            {debugResult?.ismDetails && (
              <IsmDetailsCard ismDetails={debugResult.ismDetails} blur={blur} />
            )}
            {isIcaMsg && <IcaDetailsCard message={message} blur={blur} />}
          </>
        ) : (
          <>
            {showTimeline && <DetailCardSkeleton className="w-full !bg-transparent !shadow-none" />}
            {warpRouteDetails && <DetailSectionSkeleton className="w-full" rows={4} />}
            {warpRouteDetails && <DetailCardSkeleton className="w-full" />}
            <DetailSectionSkeleton className="w-full" rows={3} />
          </>
        )}
      </div>
    </>
  );
}

function hasFullMessageDetails(message?: Message | MessageStub | null): message is Message {
  if (!message) return false;
  return (
    'decodedBody' in message ||
    'totalGasAmount' in message ||
    'totalPayment' in message ||
    'numPayments' in message ||
    'blockHash' in message.origin ||
    'blockNumber' in message.origin ||
    'mailbox' in message.origin ||
    'gasLimit' in message.origin
  );
}

function StatusHeader({
  messageStatus,
  isMessageFound,
  isFetching,
  isError,
  duration,
}: {
  messageStatus: MessageStatus;
  isMessageFound: boolean;
  isFetching: boolean;
  isError: boolean;
  duration?: string;
}) {
  let text: string;
  if (isMessageFound) {
    text = `Status: ${toTitleCase(messageStatus)}`;
  } else if (isError) {
    text = 'Error finding message';
  } else {
    text = 'Message not found';
  }

  let icon: React.ReactNode;
  if (isFetching) {
    icon = (
      <div className="flex items-center justify-center">
        <SpinnerIcon width={20} height={20} color={Color.white} />
      </div>
    );
  } else if (isMessageFound && messageStatus === MessageStatus.Delivered) {
    icon = <CheckmarkIcon width={24} height={24} color={Color.white} />;
  } else {
    icon = null;
  }

  return (
    <div className="flex items-center">
      <h3 className="mr-2 text-lg font-medium text-white">{text}</h3>
      {duration && <span className="mr-3 text-sm text-cream-300">({duration})</span>}
      {icon}
    </div>
  );
}

function useDynamicBannerColor(
  isFetching: boolean,
  status: MessageStatus,
  isMessageFound: boolean,
  isError?: boolean,
) {
  const setBanner = useStore((s) => s.setBanner);
  useEffect(() => {
    if (isFetching) return;
    if (isError) {
      logger.error('Error fetching message details');
      toast.error('Error fetching message. Please check the message id and try again.');
      setBanner('bg-red-500');
    } else if (status === MessageStatus.Failing) {
      // TODO disabling this for now due to loudness from premature gas-related errors
    } else if (!isMessageFound) {
      setBanner('bg-gray-500');
    } else {
      setBanner('');
    }
  }, [isError, isFetching, status, isMessageFound, setBanner]);
  useEffect(() => {
    return () => setBanner('');
  }, [setBanner]);
}
