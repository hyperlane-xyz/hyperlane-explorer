import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { Message, MessageStub, WarpRouteDetails } from '../../types';
import { MessageDebugResult } from '../debugger/types';
import { useMessageDeliveryStatus } from '../deliveryStatus/useMessageDeliveryStatus';
import { DetailSectionSkeleton } from './MessageDetailsLoading';
import { DEFAULT_PI_MESSAGE_DETAILS_STATE, PiMessageDetailsState } from './piMessageDetailsState';

const DestinationTransactionCard = dynamic(
  () => import('./cards/TransactionCard').then((mod) => mod.DestinationTransactionCard),
  {
    loading: () => (
      <DetailSectionSkeleton className="flex min-w-[340px] flex-1 basis-0 flex-col" rows={5} />
    ),
  },
);
const PiMessageDetailsBridge = dynamic(() =>
  import('./PiMessageDetailsBridge').then((mod) => mod.PiMessageDetailsBridge),
);

export interface MessageDetailsRuntimeState {
  hasRun: boolean;
  isFetching: boolean;
  isError: boolean;
  isMessageFound: boolean;
  message?: Message | MessageStub;
  debugResult?: MessageDebugResult;
  isDeliveryStatusFetching: boolean;
}

interface Props {
  messageId: string;
  baseMessage: Message | MessageStub;
  baseIsMessageFound: boolean;
  hasDetailedUrlMessage: boolean;
  hasGraphQlRun: boolean;
  isGraphQlMessageFound: boolean;
  destinationChainName: string;
  blur: boolean;
  warpRouteDetails?: WarpRouteDetails;
  onStateChange: (state: MessageDetailsRuntimeState) => void;
}

export function MessageDetailsRuntime({
  messageId,
  baseMessage,
  baseIsMessageFound,
  hasDetailedUrlMessage,
  hasGraphQlRun,
  isGraphQlMessageFound,
  destinationChainName,
  blur,
  warpRouteDetails,
  onStateChange,
}: Props) {
  const [piState, setPiState] = useState<PiMessageDetailsState>(DEFAULT_PI_MESSAGE_DETAILS_STATE);
  const shouldRunPi = !hasDetailedUrlMessage && hasGraphQlRun && !isGraphQlMessageFound;

  useEffect(() => {
    setPiState(DEFAULT_PI_MESSAGE_DETAILS_STATE);
  }, [messageId]);

  const isMessageFound = baseIsMessageFound || piState.isMessageFound;
  const queriedMessage = piState.message || baseMessage;
  const { messageWithDeliveryStatus, debugResult, isDeliveryStatusFetching } =
    useMessageDeliveryStatus({
      message: queriedMessage,
      enabled: isMessageFound,
    });
  const message = isMessageFound ? messageWithDeliveryStatus : undefined;
  const hasRun =
    hasDetailedUrlMessage || isGraphQlMessageFound || baseIsMessageFound || piState.hasRun;

  useEffect(() => {
    onStateChange({
      hasRun,
      isFetching: piState.isFetching,
      isError: piState.isError,
      isMessageFound,
      message,
      debugResult,
      isDeliveryStatusFetching,
    });
  }, [
    debugResult,
    hasRun,
    isDeliveryStatusFetching,
    isMessageFound,
    message,
    onStateChange,
    piState.isError,
    piState.isFetching,
  ]);

  return (
    <>
      {shouldRunPi && <PiMessageDetailsBridge messageId={messageId} onStateChange={setPiState} />}
      <DestinationTransactionCard
        chainName={destinationChainName}
        domainId={message?.destinationDomainId ?? queriedMessage.destinationDomainId}
        status={message?.status ?? queriedMessage.status}
        transaction={message?.destination}
        debugResult={debugResult}
        isStatusFetching={isDeliveryStatusFetching}
        isPiMsg={message?.isPiMsg}
        blur={blur}
        message={message || queriedMessage}
        warpRouteDetails={warpRouteDetails}
      />
    </>
  );
}
