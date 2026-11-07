import dynamic from 'next/dynamic';
import { useCallback, useEffect, useState } from 'react';

import { Message, MessageStub, WarpRouteDetails } from '../../types';
import { MessageDebugResult } from '../debugger/types';
import { useMessageDeliveryStatus } from '../deliveryStatus/useMessageDeliveryStatus';
import type { OriginConfirmation } from './diagnostics/useOriginConfirmation';
import {
  useOriginConfirmationTimestamp,
  type OriginConfirmationTimestamp,
} from './diagnostics/useOriginConfirmationTimestamp';
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
  originConfirmationTimestamp?: OriginConfirmationTimestamp;
}

interface Props {
  messageId: string;
  baseMessage: Message | MessageStub;
  baseIsMessageFound: boolean;
  hasInitialMessageDetails: boolean;
  hasGraphQlRun: boolean;
  isGraphQlMessageFound: boolean;
  destinationChainName: string;
  blur: boolean;
  isOriginConfirming: boolean;
  originConfirmation?: OriginConfirmation;
  warpRouteDetails?: WarpRouteDetails;
  onStateChange: (state: MessageDetailsRuntimeState) => void;
}

export function MessageDetailsRuntime({
  messageId,
  baseMessage,
  baseIsMessageFound,
  hasInitialMessageDetails,
  hasGraphQlRun,
  isGraphQlMessageFound,
  destinationChainName,
  blur,
  isOriginConfirming,
  originConfirmation,
  warpRouteDetails,
  onStateChange,
}: Props) {
  const [piState, setPiState] = useState<{
    messageId: string;
    value: PiMessageDetailsState;
  }>({ messageId, value: DEFAULT_PI_MESSAGE_DETAILS_STATE });
  const shouldRunPi = !hasInitialMessageDetails && hasGraphQlRun && !isGraphQlMessageFound;
  const activePiState =
    piState.messageId === messageId ? piState.value : DEFAULT_PI_MESSAGE_DETAILS_STATE;

  const handlePiStateChange = useCallback(
    (value: PiMessageDetailsState) => {
      setPiState({ messageId, value });
    },
    [messageId],
  );

  const isMessageFound = baseIsMessageFound || activePiState.isMessageFound;
  const queriedMessage = activePiState.message || baseMessage;
  const { messageWithDeliveryStatus, debugResult, isDeliveryStatusFetching } =
    useMessageDeliveryStatus({
      message: queriedMessage,
      enabled: isMessageFound,
    });
  const message = isMessageFound ? messageWithDeliveryStatus : undefined;
  const originConfirmationTimestamp = useOriginConfirmationTimestamp(
    queriedMessage,
    originConfirmation,
  );
  const hasRun =
    hasInitialMessageDetails || isGraphQlMessageFound || baseIsMessageFound || activePiState.hasRun;

  useEffect(() => {
    onStateChange({
      hasRun,
      isFetching: activePiState.isFetching,
      isError: activePiState.isError,
      isMessageFound,
      message,
      debugResult,
      isDeliveryStatusFetching,
      originConfirmationTimestamp,
    });
  }, [
    debugResult,
    hasRun,
    isDeliveryStatusFetching,
    isMessageFound,
    message,
    onStateChange,
    originConfirmationTimestamp,
    activePiState.isError,
    activePiState.isFetching,
  ]);

  return (
    <>
      {shouldRunPi && (
        <PiMessageDetailsBridge
          key={messageId}
          messageId={messageId}
          onStateChange={handlePiStateChange}
        />
      )}
      <DestinationTransactionCard
        chainName={destinationChainName}
        domainId={message?.destinationDomainId ?? queriedMessage.destinationDomainId}
        status={message?.status ?? queriedMessage.status}
        transaction={message?.destination}
        debugResult={debugResult}
        isStatusFetching={isDeliveryStatusFetching}
        isOriginConfirming={isOriginConfirming}
        isPiMsg={message?.isPiMsg}
        blur={blur}
        message={message || queriedMessage}
        warpRouteDetails={warpRouteDetails}
      />
    </>
  );
}
