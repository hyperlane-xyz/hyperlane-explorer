import dynamic from 'next/dynamic';
import { lazy, Suspense, useCallback, useEffect, useState } from 'react';

import { Message, MessageStub, WarpRouteDetails } from '../../types';
import { MessageDebugResult } from '../debugger/types';
import { useMessageDeliveryStatus } from '../deliveryStatus/useMessageDeliveryStatus';
import { DestinationTransactionPreviewCard } from './cards/OriginTransactionCard';
import { CollateralInfo, CollateralStatus } from './collateral/types';
import type { OriginConfirmation } from './diagnostics/useOriginConfirmation';
import {
  useOriginConfirmationTimestamp,
  type OriginConfirmationTimestamp,
} from './diagnostics/useOriginConfirmationTimestamp';
import { DEFAULT_PI_MESSAGE_DETAILS_STATE, PiMessageDetailsState } from './piMessageDetailsState';

const DestinationTransactionCard = lazy(() =>
  import('./cards/TransactionCard').then((mod) => ({ default: mod.DestinationTransactionCard })),
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
  originConfirmationBlock?: OriginConfirmationTimestamp;
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
  const originConfirmationBlock = useOriginConfirmationTimestamp(
    message ?? queriedMessage,
    isMessageFound ? originConfirmation : undefined,
  );
  const hasRun =
    hasInitialMessageDetails || isGraphQlMessageFound || baseIsMessageFound || activePiState.hasRun;
  const transactionProps = {
    chainName: destinationChainName,
    domainId: message?.destinationDomainId ?? queriedMessage.destinationDomainId,
    status: message?.status ?? queriedMessage.status,
    transaction: message?.destination,
    blur,
    isOriginConfirming,
  };

  useEffect(() => {
    onStateChange({
      hasRun,
      isFetching: activePiState.isFetching,
      isError: activePiState.isError,
      isMessageFound,
      message,
      debugResult,
      collateralInfo,
      originConfirmationBlock,
    });
  }, [
    collateralInfo,
    originConfirmationBlock,
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
      <Suspense
        fallback={
          <DestinationTransactionPreviewCard
            {...transactionProps}
            isLiveDetailsPending={isDeliveryStatusFetching}
          />
        }
      >
        <DestinationTransactionCard
          {...transactionProps}
          debugResult={debugResult}
          isStatusFetching={isDeliveryStatusFetching}
          isPiMsg={message?.isPiMsg}
          message={message ?? queriedMessage}
          warpRouteDetails={warpRouteDetails}
          onCollateralInfoChange={handleCollateralInfoChange}
        />
      </Suspense>
    </>
  );
}
