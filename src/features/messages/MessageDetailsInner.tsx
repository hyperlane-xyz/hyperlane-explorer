import { toTitleCase } from '@hyperlane-xyz/utils';
import { SpinnerIcon } from '@hyperlane-xyz/widgets';
import dynamic from 'next/dynamic';
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import { CheckmarkIcon } from '../../components/icons/CheckmarkIcon';
import { useChainMetadataResolver, useStore } from '../../metadataStore';
import { Color } from '../../styles/Color';
import { Message, MessageStatus, MessageStub } from '../../types';
import { logger } from '../../utils/logger';
import { getHumanReadableDuration } from '../../utils/time';
import { getChainDisplayName, isEvmChain } from '../chains/utils';
import { DetailCardSkeleton, DetailSectionSkeleton } from './MessageDetailsLoading';
import type { MessageDetailsRuntimeState } from './MessageDetailsRuntime';
import {
  DestinationTransactionPreviewCard,
  OriginTransactionCard,
} from './cards/OriginTransactionCard';
import { useIsIcaMessage } from './icaUtils';
import { PLACEHOLDER_MESSAGE } from './placeholderMessages';
import { useMessageQuery } from './queries/useMessageQuery';
import { parseWarpRouteMessageDetails } from './utils';

const ContentDetailsCard = dynamic(
  () => import('./cards/ContentDetailsCard').then((mod) => mod.ContentDetailsCard),
  { loading: () => <DetailSectionSkeleton className="w-full" rows={4} /> },
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
const GasDetailsCard = dynamic(
  () => import('./cards/GasDetailsCard').then((mod) => mod.GasDetailsCard),
  {
    loading: () => <DetailSectionSkeleton className="w-full" rows={3} />,
  },
);
const WarpRouteVisualizationCard = dynamic(
  () => import('./cards/WarpRouteVisualizationCard').then((mod) => mod.WarpRouteVisualizationCard),
  { loading: () => <DetailCardSkeleton className="w-full" /> },
);
const WarpTransferDetailsCard = dynamic(
  () => import('./cards/WarpTransferDetailsCard').then((mod) => mod.WarpTransferDetailsCard),
  { loading: () => <DetailSectionSkeleton className="w-full" rows={4} /> },
);
const TimelineCard = dynamic(() => import('./cards/TimelineCard').then((mod) => mod.TimelineCard), {
  loading: () => <DetailCardSkeleton className="w-full !bg-transparent !shadow-none" />,
});
const MessageDetailsRuntime = lazy(() =>
  import('./MessageDetailsRuntime').then((mod) => ({ default: mod.MessageDetailsRuntime })),
);

interface Props {
  messageId: string;
  message?: Message | MessageStub;
}

export function MessageDetailsInner({ messageId, message: messageFromUrlParams }: Props) {
  const chainMetadataResolver = useChainMetadataResolver();
  const ensureWarpRouteData = useStore((s) => s.ensureWarpRouteData);
  const isWarpRouteDataLoaded = useStore((s) => s.isWarpRouteDataLoaded);
  const [runtimeState, setRuntimeState] = useState<{
    messageId: string;
    value: MessageDetailsRuntimeState;
  } | null>(null);
  const hasDetailedUrlMessage = hasFullMessageDetails(messageFromUrlParams);

  const {
    isFetching: isGraphQlFetching,
    isError: isGraphQlError,
    hasRun: hasGraphQlRun,
    isMessageFound: isGraphQlMessageFound,
    message: messageFromGraphQl,
  } = useMessageQuery({ messageId, pause: hasDetailedUrlMessage });

  const baseIsMessageFound = !!messageFromUrlParams || isGraphQlMessageFound;
  const baseMessage =
    (hasDetailedUrlMessage ? messageFromUrlParams : messageFromGraphQl || messageFromUrlParams) ||
    PLACEHOLDER_MESSAGE;
  const needsRuntimeMessageLookup =
    !baseIsMessageFound && !hasDetailedUrlMessage && hasGraphQlRun && !isGraphQlMessageFound;
  const activeRuntimeState = runtimeState?.messageId === messageId ? runtimeState.value : null;
  const handleRuntimeStateChange = useCallback(
    (value: MessageDetailsRuntimeState) => setRuntimeState({ messageId, value }),
    [messageId],
  );
  const message = activeRuntimeState?.message || baseMessage;
  const isMessageFound = activeRuntimeState?.isMessageFound ?? baseIsMessageFound;
  const isFetching =
    isGraphQlFetching ||
    !!activeRuntimeState?.isFetching ||
    (needsRuntimeMessageLookup && !activeRuntimeState?.hasRun);
  const isError = isGraphQlError || !!activeRuntimeState?.isError;
  const blur = !isMessageFound;
  const isIcaMsg = useIsIcaMessage(message);
  const debugResult = activeRuntimeState?.debugResult;

  const { status, originDomainId, destinationDomainId, origin, destination, isPiMsg } = message;

  const duration = destination?.timestamp
    ? getHumanReadableDuration(destination.timestamp - origin.timestamp, 3)
    : undefined;

  const showTimeline =
    !isPiMsg &&
    'blockNumber' in origin &&
    isEvmChain(chainMetadataResolver, originDomainId) &&
    isEvmChain(chainMetadataResolver, destinationDomainId);

  useDynamicBannerColor(isFetching, status, isMessageFound, isError);

  const originChainName = chainMetadataResolver.tryGetChainName(originDomainId) || 'Unknown';
  const destinationChainName =
    chainMetadataResolver.tryGetChainName(destinationDomainId) || 'Unknown';

  const warpRouteChainAddressMap = useStore((s) => s.warpRouteChainAddressMap);

  useEffect(() => {
    if (isWarpRouteDataLoaded || !isMessageFound) return;
    ensureWarpRouteData().catch((e) => logger.error('Error loading warp route data', e));
  }, [ensureWarpRouteData, isMessageFound, isWarpRouteDataLoaded]);

  useEffect(() => {
    setRuntimeState(null);
  }, [messageId]);

  const warpRouteDetails = useMemo(
    () => parseWarpRouteMessageDetails(message, warpRouteChainAddressMap, chainMetadataResolver),
    [chainMetadataResolver, message, warpRouteChainAddressMap],
  );
  const destinationPreview = (
    <DestinationTransactionPreviewCard
      chainName={destinationChainName}
      domainId={destinationDomainId}
      status={status}
      transaction={destination}
      blur={blur}
      isLiveDetailsPending={isFetching}
    />
  );

  return (
    <>
      <div className="flex items-center justify-between rounded bg-accent-gradient px-3 py-3 shadow-accent-glow">
        <div className="flex items-center gap-2">
          <div className="h-2.5 w-2.5 rounded-full bg-cream-300" />
          <h2 className="text-lg font-medium text-white">{`${
            isIcaMsg ? 'ICA ' : ''
          }Message to ${getChainDisplayName(chainMetadataResolver, destinationChainName)}`}</h2>
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
        <Suspense fallback={destinationPreview}>
          <MessageDetailsRuntime
            messageId={messageId}
            baseMessage={baseMessage}
            baseIsMessageFound={baseIsMessageFound}
            hasDetailedUrlMessage={hasDetailedUrlMessage}
            hasGraphQlRun={hasGraphQlRun}
            isGraphQlMessageFound={isGraphQlMessageFound}
            destinationChainName={destinationChainName}
            blur={blur}
            warpRouteDetails={warpRouteDetails}
            onStateChange={handleRuntimeStateChange}
          />
        </Suspense>
        {showTimeline && <TimelineCard message={message} blur={blur} />}
        {warpRouteDetails && (
          <WarpTransferDetailsCard
            message={message}
            warpRouteDetails={warpRouteDetails}
            blur={blur}
          />
        )}
        <WarpRouteVisualizationCard
          message={message}
          warpRouteDetails={warpRouteDetails}
          blur={blur}
        />
        <ContentDetailsCard message={message} blur={blur} />
        <GasDetailsCard
          message={message}
          igpPayments={debugResult?.gasDetails?.contractToPayments}
          blur={blur}
        />
        {debugResult?.ismDetails && (
          <IsmDetailsCard ismDetails={debugResult.ismDetails} blur={blur} />
        )}
        {isIcaMsg && <IcaDetailsCard message={message} blur={blur} />}
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
