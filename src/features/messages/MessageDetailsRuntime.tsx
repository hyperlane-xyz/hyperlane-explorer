import dynamic from 'next/dynamic';
import { useCallback, useEffect, useState } from 'react';

import { Message, MessageStub, WarpRouteDetails } from '../../types';
import { MessageDebugResult } from '../debugger/types';
import { useMessageDeliveryStatus } from '../deliveryStatus/useMessageDeliveryStatus';
import { CollateralInfo, CollateralStatus } from './collateral/types';
import { DetailSectionSkeleton } from './MessageDetailsLoading';
import { DEFAULT_PI_MESSAGE_DETAILS_STATE, PiMessageDetailsState } from './piMessageDetailsState';

const DestinationTransactionCard = dynamic(
  () => import('./cards/TransactionCard').then((mod) => mod.DestinationTransactionCard),
  {
    loading: () => (
      <DetailSectionSkeleton
        className="flex min-w-0 flex-1 basis-full flex-col sm:basis-0"
        rows={5}
      />
    ),
  },
);
const PiMessageDetailsBridge = dynamic(() =>
  import('./PiMessageDetailsBridge').then((mod) => mod.PiMessageDetailsBridge),
);
const UNKNOWN_COLLATERAL_INFO = { status: CollateralStatus.Unknown } as const;

export interface MessageDetailsRuntimeState {
  hasRun: boolean;
  isFetching: boolean;
  isError: boolean;
  isMessageFound: boolean;
  message?: Message | MessageStub;
  debugResult?: MessageDebugResult;
  collateralInfo: CollateralInfo;
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
  warpRouteDetails,
  onStateChange,
}: Props) {
  const [piState, setPiState] = useState<{
    messageId: string;
    value: PiMessageDetailsState;
  }>({ messageId, value: DEFAULT_PI_MESSAGE_DETAILS_STATE });
  const [collateralState, setCollateralState] = useState<{
    messageId: string;
    info: CollateralInfo;
  } | null>(null);
  const collateralInfo =
    collateralState?.messageId === messageId ? collateralState.info : UNKNOWN_COLLATERAL_INFO;
  const shouldRunPi = !hasInitialMessageDetails && hasGraphQlRun && !isGraphQlMessageFound;
  const activePiState =
    piState.messageId === messageId ? piState.value : DEFAULT_PI_MESSAGE_DETAILS_STATE;

  const handlePiStateChange = useCallback(
    (value: PiMessageDetailsState) => {
      setPiState({ messageId, value });
    },
    [messageId],
  );

  const handleCollateralInfoChange = useCallback(
    (info: CollateralInfo) => {
      setCollateralState((previous) =>
        previous?.messageId === messageId &&
        previous.info.status === info.status &&
        previous.info.available === info.available &&
        previous.info.required === info.required &&
        previous.info.deficit === info.deficit
          ? previous
          : { messageId, info },
      );
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
      collateralInfo,
    });
  }, [
    collateralInfo,
    debugResult,
    hasRun,
    isMessageFound,
    message,
    onStateChange,
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
        onCollateralInfoChange={handleCollateralInfoChange}
      />
    </>
  );
}
