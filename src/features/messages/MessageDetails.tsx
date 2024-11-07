import Image from 'next/image';
import { useEffect } from 'react';
import { toast } from 'react-toastify';

import { toTitleCase, trimToLength } from '@hyperlane-xyz/utils';

import { Spinner } from '../../components/animations/Spinner';
import { Card } from '../../components/layout/Card';
import CheckmarkIcon from '../../images/icons/checkmark-circle.svg';
import { useMultiProvider, useStore } from '../../store';
import { Message, MessageStatus } from '../../types';
import { logger } from '../../utils/logger';
import { getHumanReadableDuration } from '../../utils/time';
import { getChainDisplayName, isEvmChain } from '../chains/utils';
import { useMessageDeliveryStatus } from '../deliveryStatus/useMessageDeliveryStatus';

import { ContentDetailsCard } from './cards/ContentDetailsCard';
import { GasDetailsCard } from './cards/GasDetailsCard';
import { IcaDetailsCard } from './cards/IcaDetailsCard';
import { IsmDetailsCard } from './cards/IsmDetailsCard';
import { TimelineCard } from './cards/TimelineCard';
import { DestinationTransactionCard, OriginTransactionCard } from './cards/TransactionCard';
import { useIsIcaMessage } from './ica';
import { usePiChainMessageQuery } from './pi-queries/usePiChainMessageQuery';
import { PLACEHOLDER_MESSAGE } from './placeholderMessages';
import { useMessageQuery } from './queries/useMessageQuery';

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

  const { msgId, status, originDomainId, destinationDomainId, origin, destination, isPiMsg } =
    message;

  const duration = destination?.timestamp
    ? getHumanReadableDuration(destination.timestamp - origin.timestamp, 3)
    : undefined;

  const showTimeline =
    !isPiMsg &&
    isEvmChain(multiProvider, originDomainId) &&
    isEvmChain(multiProvider, destinationDomainId);

  // Banner color setter
  useDynamicBannerColor(isFetching, status, isMessageFound, isError || isPiError);

  const originChainName = multiProvider.getChainName(originDomainId);
  const destinationChainName = multiProvider.getChainName(destinationDomainId);

  return (
    <>
      <Card className="flex items-center justify-between rounded-full px-1">
        <h2 className="font-medium text-blue-500">{`${
          isIcaMsg ? 'ICA ' : ''
        } Message ${trimToLength(msgId, 6)} to ${getChainDisplayName(
          multiProvider,
          destinationChainName,
        )}`}</h2>
        <StatusHeader
          messageStatus={status}
          isMessageFound={isMessageFound}
          isFetching={isFetching}
          isError={isError}
        />
      </Card>
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
          duration={duration}
          debugResult={debugResult}
          isStatusFetching={isDeliveryStatusFetching}
          isPiMsg={isPiMsg}
          blur={blur}
        />
        {showTimeline && <TimelineCard message={message} blur={blur} />}
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

function StatusHeader({
  messageStatus,
  isMessageFound,
  isFetching,
  isError,
}: {
  messageStatus: MessageStatus;
  isMessageFound: boolean;
  isFetching: boolean;
  isError: boolean;
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
      <div className="flex h-7 w-7 items-center justify-center overflow-hidden">
        <div className="scale-[35%]">
          <Spinner />
        </div>
      </div>
    );
  } else if (isMessageFound && messageStatus === MessageStatus.Delivered) {
    icon = <Image src={CheckmarkIcon} width={24} height={24} alt="" />;
  } else {
    // icon = <Image src={ErrorCircleIcon} width={24} height={24} className="invert" alt="" />;
    icon = null;
  }

  return (
    <div className="flex items-center">
      <h3 className="lg mr-3 font-medium text-blue-500">{text}</h3>
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
