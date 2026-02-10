import { toTitleCase } from '@hyperlane-xyz/utils';
import { SpinnerIcon } from '@hyperlane-xyz/widgets';
import { useEffect, useMemo } from 'react';
import { toast } from 'react-toastify';
import { CheckmarkIcon } from '../../components/icons/CheckmarkIcon';
import { useMultiProvider, useStore } from '../../store';
import { Color } from '../../styles/Color';
import { Message, MessageStatus } from '../../types';
import { logger } from '../../utils/logger';
import { getHumanReadableDuration } from '../../utils/time';
import { getChainDisplayName, isEvmChain } from '../chains/utils';
import { useIsmDetails } from '../debugger/useIsmDetails';
import { useMessageDeliveryStatus } from '../deliveryStatus/useMessageDeliveryStatus';
import { ContentDetailsCard } from './cards/ContentDetailsCard';
import { GasDetailsCard } from './cards/GasDetailsCard';
import { IcaDetailsCard } from './cards/IcaDetailsCard';
import { IsmDetailsCard, extractValidatorInfo } from './cards/IsmDetailsCard';
import { TimelineCard } from './cards/TimelineCard';
import { DestinationTransactionCard, OriginTransactionCard } from './cards/TransactionCard';
import { WarpRouteVisualizationCard } from './cards/WarpRouteVisualizationCard';
import { WarpTransferDetailsCard } from './cards/WarpTransferDetailsCard';
import { useIsIcaMessage } from './ica';
import { usePiChainMessageQuery } from './pi-queries/usePiChainMessageQuery';
import { PLACEHOLDER_MESSAGE } from './placeholderMessages';
import { useMessageQuery } from './queries/useMessageQuery';
import { parseWarpRouteMessageDetails } from './utils';

interface Props {
  messageId: string; // Hex value for message id
  message?: Message; // If provided, component will use this data instead of querying
}

export function MessageDetails({ messageId, message: messageFromUrlParams }: Props) {
  const multiProvider = useMultiProvider();

  // GraphQL query and results
  const {
    isFetching: isGraphQlFetching,
    isError: isGraphQlError,
    hasRun: hasGraphQlRun,
    isMessageFound: isGraphQlMessageFound,
    message: messageFromGraphQl,
  } = useMessageQuery({ messageId, pause: !!messageFromUrlParams });

  // Run permissionless interop chains query if needed
  const {
    isError: isPiError,
    isFetching: isPiFetching,
    message: messageFromPi,
    isMessageFound: isPiMessageFound,
  } = usePiChainMessageQuery({
    messageId,
    pause: !!messageFromUrlParams || !hasGraphQlRun || isGraphQlMessageFound,
  });

  // Coalesce GraphQL + PI results
  const _message =
    messageFromUrlParams || messageFromGraphQl || messageFromPi || PLACEHOLDER_MESSAGE;
  const isMessageFound = !!messageFromUrlParams || isGraphQlMessageFound || isPiMessageFound;
  const isFetching = isGraphQlFetching || isPiFetching;
  const isError = isGraphQlError || isPiError;
  const blur = !isMessageFound;
  const isIcaMsg = useIsIcaMessage(_message);

  // If message isn't delivered, attempt to check for
  // more recent updates and possibly debug info
  const {
    messageWithDeliveryStatus: message,
    debugResult,
    isDeliveryStatusFetching,
  } = useMessageDeliveryStatus({
    message: _message,
    enabled: isMessageFound,
  });

  const { status, originDomainId, destinationDomainId, origin, destination, isPiMsg } = message;

  // Fetch ISM details from backend API (includes real validator signature status)
  const { data: ismDetails } = useIsmDetails(isMessageFound ? message : null);

  const duration = destination?.timestamp
    ? getHumanReadableDuration(destination.timestamp - origin.timestamp, 3)
    : undefined;

  const showTimeline =
    !isPiMsg &&
    isEvmChain(multiProvider, originDomainId) &&
    isEvmChain(multiProvider, destinationDomainId);

  // Banner color setter
  useDynamicBannerColor(isFetching, status, isMessageFound, isError || isPiError);

  const originChainName = multiProvider.tryGetChainName(originDomainId) || 'Unknown';
  const destinationChainName = multiProvider.tryGetChainName(destinationDomainId) || 'Unknown';

  const warpRouteChainAddressMap = useStore((s) => s.warpRouteChainAddressMap);
  const warpRouteDetails = useMemo(
    () => parseWarpRouteMessageDetails(message, warpRouteChainAddressMap, multiProvider),
    [message, warpRouteChainAddressMap, multiProvider],
  );

  return (
    <>
      <div className="flex items-center justify-between rounded bg-accent-gradient px-3 py-2 shadow-accent-glow">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-cream-300" />
          <h2 className="text-md font-medium text-white">{`${
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
          validatorInfo={ismDetails ? extractValidatorInfo(ismDetails) : null}
        />
        {showTimeline && (
          <TimelineCard
            message={message}
            blur={blur}
            debugResult={debugResult}
            ismResult={ismDetails}
          />
        )}
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
        <ContentDetailsCard message={message} blur={blur} />
        <GasDetailsCard
          message={message}
          igpPayments={debugResult?.gasDetails?.contractToPayments}
          blur={blur}
        />
        {ismDetails && <IsmDetailsCard result={ismDetails} blur={blur} />}
        {isIcaMsg && <IcaDetailsCard message={message} blur={blur} />}
      </div>
    </>
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
    // icon = <Image src={ErrorCircleIcon} width={24} height={24} className="invert" alt="" />;
    icon = null;
  }

  return (
    <div className="flex items-center">
      <h3 className="mr-2 text-md font-medium text-white">{text}</h3>
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
      // setBanner('bg-red-500');
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
