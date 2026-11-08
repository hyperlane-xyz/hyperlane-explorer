import dynamic from 'next/dynamic';
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';

import { isAeroVoterMessage } from '../../consts/aeroVoterRoutes';
import { getMessagePause } from '../../consts/pausedRoutes';
import { useChainMetadataResolver, useStore } from '../../metadataStore';
import { Message, MessageStatus, MessageStub } from '../../types';
import { logger } from '../../utils/logger';
import { useTransactionMessageCount } from '../transactions/useTransactionMessageCount';
import { MessageOverviewCard } from './cards/MessageOverviewCard';
import { MessageRelayActivityPanel } from './cards/MessageRelayActivityPanel';
import { MessageTechnicalDetails } from './cards/MessageTechnicalDetails';
import {
  DestinationTransactionPreviewCard,
  OriginTransactionCard,
} from './cards/OriginTransactionCard';
import { CollateralStatus } from './collateral/types';
import { MessageDiagnosticsProvider } from './diagnostics/MessageDiagnosticsContext';
import { useOriginConfirmation } from './diagnostics/useOriginConfirmation';
import { useIsIcaMessage } from './ica';
import {
  DetailCardSkeleton,
  DetailSectionSkeleton,
  MessageDetailsLoading,
} from './MessageDetailsLoading';
import type { MessageDetailsRuntimeState } from './MessageDetailsRuntime';
import { PLACEHOLDER_MESSAGE } from './placeholderMessages';
import { useMessageQuery } from './queries/useMessageQuery';
import { isWaitingForOriginConfirmations } from './useConfirmationProgress';
import { parseWarpRouteMessageDetails } from './utils';

const ContentDetailsCard = dynamic(
  () => import('./cards/ContentDetailsCard').then((mod) => mod.ContentDetailsCard),
  { loading: () => <DetailSectionSkeleton className="w-full" rows={4} /> },
);
const AeroVoterDetailsCard = dynamic(() =>
  import('./cards/AeroVoterDetailsCard').then((mod) => mod.AeroVoterDetailsCard),
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
const OriginGasPaymentDetails = dynamic(
  () => import('./cards/OriginGasPaymentDetails').then((mod) => mod.OriginGasPaymentDetails),
  { loading: () => <p className="py-3 text-sm text-gray-500">Loading funding details…</p> },
);
const WarpRouteVisualizationCard = dynamic(
  () => import('./cards/WarpRouteVisualizationCard').then((mod) => mod.WarpRouteVisualizationCard),
  { loading: () => <DetailCardSkeleton className="w-full" /> },
);
const MessageLifecycleCard = dynamic(
  () => import('./cards/MessageLifecycleCard').then((mod) => mod.MessageLifecycleCard),
  {
    loading: () => <MessageDetailsLoading />,
  },
);
const MessageDiagnosticsCard = dynamic(
  () => import('./cards/MessageDiagnosticsCard').then((mod) => mod.MessageDiagnosticsCard),
  { loading: () => <DetailSectionSkeleton className="w-full" rows={5} /> },
);
const MessageDetailsRuntime = lazy(() =>
  import('./MessageDetailsRuntime').then((mod) => ({ default: mod.MessageDetailsRuntime })),
);

interface Props {
  messageId: string;
  message?: Message | MessageStub;
}

export function MessageDetailsInner({ messageId, message: initialMessage }: Props) {
  const chainMetadataResolver = useChainMetadataResolver();
  const ensureChainMetadata = useStore((s) => s.ensureChainMetadata);
  const ensureWarpRouteData = useStore((s) => s.ensureWarpRouteData);
  const isWarpRouteDataLoaded = useStore((s) => s.isWarpRouteDataLoaded);
  const warpRouteChainAddressMap = useStore((s) => s.warpRouteChainAddressMap);
  const [runtimeState, setRuntimeState] = useState<{
    messageId: string;
    value: MessageDetailsRuntimeState;
  } | null>(null);
  const hasInitialMessageDetails = hasCompleteMessageDetails(initialMessage);

  const {
    isFetching: isGraphQlFetching,
    isError: isGraphQlError,
    hasRun: hasGraphQlRun,
    isMessageFound: isGraphQlMessageFound,
    message: messageFromGraphQl,
  } = useMessageQuery({ messageId, pause: hasInitialMessageDetails });

  const baseIsMessageFound = !!initialMessage || isGraphQlMessageFound;
  const baseMessage =
    (hasInitialMessageDetails ? initialMessage : messageFromGraphQl || initialMessage) ||
    PLACEHOLDER_MESSAGE;
  const needsRuntimeMessageLookup =
    !baseIsMessageFound && !hasInitialMessageDetails && hasGraphQlRun && !isGraphQlMessageFound;
  const activeRuntimeState = runtimeState?.messageId === messageId ? runtimeState.value : null;
  // Indexed delivery is authoritative, even before the runtime effect catches up.
  const message =
    baseMessage.status === MessageStatus.Delivered
      ? baseMessage
      : activeRuntimeState?.message || baseMessage;
  const originConfirmation = useOriginConfirmation(message, chainMetadataResolver);
  const confirmationProgress =
    originConfirmation.required === undefined
      ? null
      : { required: originConfirmation.required, current: originConfirmation.current ?? null };
  const originTimestamp = activeRuntimeState?.originConfirmationTimestamp;
  const timedOriginConfirmation = {
    ...originConfirmation,
    timestamp:
      originConfirmation.timestamp ??
      (originConfirmation.confirmed &&
      originTimestamp?.blockNumber === originConfirmation.blockNumber
        ? originTimestamp?.timestamp
        : undefined),
  };
  const isMessageFound = activeRuntimeState?.isMessageFound ?? baseIsMessageFound;
  const isOriginConfirming =
    isMessageFound &&
    !getMessagePause(message) &&
    isWaitingForOriginConfirmations(message, confirmationProgress);
  const isFetching =
    isGraphQlFetching ||
    !!activeRuntimeState?.isFetching ||
    (needsRuntimeMessageLookup && !activeRuntimeState?.hasRun);
  const isError = isGraphQlError || !!activeRuntimeState?.isError;
  const blur = !isMessageFound;
  const isIcaMsg = useIsIcaMessage({
    sender: message.sender,
    recipient: message.recipient,
    originDomainId: message.originDomainId,
    destinationDomainId: message.destinationDomainId,
  });
  const debugResult = activeRuntimeState?.debugResult;
  const { status, originDomainId, destinationDomainId, origin, destination } = message;
  const showLifecycle = isMessageFound;
  const confirmed =
    baseMessage.status === MessageStatus.Delivered && baseMessage.isProvisional === false;
  const originChainName = chainMetadataResolver.tryGetChainName(originDomainId) || 'Unknown';
  const destinationChainName =
    chainMetadataResolver.tryGetChainName(destinationDomainId) || 'Unknown';
  const warpRouteDetails = useMemo(
    () => parseWarpRouteMessageDetails(message, warpRouteChainAddressMap, chainMetadataResolver),
    [chainMetadataResolver, message, warpRouteChainAddressMap],
  );
  const txMessageCount = useTransactionMessageCount(isMessageFound ? origin.hash : undefined);
  const handleRuntimeStateChange = useCallback(
    (value: MessageDetailsRuntimeState) =>
      setRuntimeState((prev) => {
        if (prev?.messageId === messageId && isRuntimeStateEqual(prev.value, value)) return prev;
        return { messageId, value };
      }),
    [messageId],
  );

  useDynamicBannerColor(isFetching, status, isMessageFound, isError);

  useEffect(() => {
    ensureChainMetadata().catch((e) => logger.error('Error loading chain metadata', e));
  }, [ensureChainMetadata]);

  useEffect(() => {
    if (isWarpRouteDataLoaded) return;
    ensureWarpRouteData().catch((e) => logger.error('Error loading warp route data', e));
  }, [ensureWarpRouteData, isWarpRouteDataLoaded]);

  const pause = status !== MessageStatus.Delivered ? getMessagePause(message) : undefined;
  const waitingForLiquidity =
    status !== MessageStatus.Delivered &&
    activeRuntimeState?.collateralStatus === CollateralStatus.Insufficient;

  return (
    <MessageDiagnosticsProvider messageId={messageId} live={showLifecycle} enabled={showLifecycle}>
      <div className="mx-auto w-full min-w-0 max-w-5xl space-y-4 sm:space-y-5">
        {isMessageFound ? (
          <MessageLifecycleCard
            key={`progress-${messageId}`}
            messageId={messageId}
            message={message}
            confirmed={confirmed}
            originConfirmation={timedOriginConfirmation}
            messageKind={
              warpRouteDetails
                ? 'Warp Transfer'
                : isIcaMsg
                  ? 'Interchain account message'
                  : 'Interchain message'
            }
            paused={!!pause}
            waitingForLiquidity={waitingForLiquidity}
            notice={
              (pause || waitingForLiquidity || status === MessageStatus.Failing) && (
                <aside
                  className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
                  aria-live="polite"
                >
                  <p className="font-medium">
                    {pause
                      ? 'Delivery is paused'
                      : waitingForLiquidity
                        ? 'Waiting for destination liquidity'
                        : 'Delivery needs attention'}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed">
                    {pause
                      ? 'This route or chain is paused. Delivery will not proceed while the pause remains active.'
                      : waitingForLiquidity
                        ? 'The destination route needs more liquidity to complete this transfer. See the destination transaction below for balances and rebalance status.'
                        : 'The destination check reported an issue. See the destination transaction below for delivery diagnostics.'}
                  </p>
                  {pause?.link && (
                    <a
                      href={pause.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-block text-xs underline underline-offset-2"
                    >
                      Read the status update ↗
                    </a>
                  )}
                </aside>
              )
            }
          >
            {(active) => (
              <MessageOverviewCard
                message={message}
                warpRouteDetails={warpRouteDetails}
                txMessageCount={txMessageCount}
                active={active}
              />
            )}
          </MessageLifecycleCard>
        ) : isFetching ? (
          <MessageDetailsLoading />
        ) : (
          <section
            className="rounded-xl border border-gray-200 bg-white p-6 sm:p-8"
            aria-live="polite"
          >
            <h1 className="text-xl font-medium text-gray-900">
              {isError ? 'Message temporarily unavailable' : 'Message not found'}
            </h1>
            <p className="mt-2 text-sm text-gray-600">
              {isError
                ? 'The explorer could not load this message. Please try again shortly.'
                : 'Check the message ID. A newly dispatched message may still be indexing.'}
            </p>
            <code className="mt-4 block break-all text-xs text-gray-500">{messageId}</code>
          </section>
        )}

        {isMessageFound && (
          <ContentDetailsCard
            key={`envelope-${messageId}`}
            message={message}
            blur={false}
            warpRouteDetails={warpRouteDetails}
            isIca={isIcaMsg}
          />
        )}

        <div hidden={!isMessageFound}>
          <div className="flex min-w-0 flex-wrap gap-4">
            <OriginTransactionCard
              chainName={originChainName}
              domainId={originDomainId}
              transaction={origin}
              blur={blur}
            >
              {isMessageFound && (
                <OriginGasPaymentDetails
                  message={message}
                  blur={false}
                  igpPayments={debugResult?.gasDetails?.contractToPayments}
                />
              )}
            </OriginTransactionCard>
            <Suspense
              fallback={
                <DestinationTransactionPreviewCard
                  chainName={destinationChainName}
                  domainId={destinationDomainId}
                  status={status}
                  transaction={destination}
                  blur={blur}
                  isLiveDetailsPending={isFetching}
                  isOriginConfirming={isOriginConfirming}
                />
              }
            >
              <MessageDetailsRuntime
                key={messageId}
                messageId={messageId}
                baseMessage={baseMessage}
                baseIsMessageFound={baseIsMessageFound}
                hasInitialMessageDetails={hasInitialMessageDetails}
                hasGraphQlRun={hasGraphQlRun}
                isGraphQlMessageFound={isGraphQlMessageFound}
                destinationChainName={destinationChainName}
                blur={blur}
                isOriginConfirming={isOriginConfirming}
                originConfirmation={originConfirmation}
                warpRouteDetails={warpRouteDetails}
                onStateChange={handleRuntimeStateChange}
              />
            </Suspense>
          </div>
        </div>

        <MessageTechnicalDetails
          key={`technical-${messageId}`}
          hidden={!isMessageFound}
          security={
            showLifecycle && (
              <MessageDiagnosticsCard
                destinationChainName={destinationChainName}
                delivered={status === MessageStatus.Delivered}
              />
            )
          }
          activity={
            showLifecycle && (
              <MessageRelayActivityPanel
                paused={!!pause}
                waitingForLiquidity={waitingForLiquidity}
                message={message}
                confirmed={confirmed}
                originConfirmation={timedOriginConfirmation}
              />
            )
          }
          details={
            <>
              {isIcaMsg && (
                <IcaDetailsCard message={message} blur={blur} debugResult={debugResult} />
              )}
              {isAeroVoterMessage(message) && (
                <AeroVoterDetailsCard message={message} blur={blur} />
              )}
              <WarpRouteVisualizationCard
                message={message}
                warpRouteDetails={warpRouteDetails}
                blur={blur}
              />
              {debugResult?.ismDetails && (
                <IsmDetailsCard ismDetails={debugResult.ismDetails} blur={blur} />
              )}
              {!isIcaMsg &&
                !isAeroVoterMessage(message) &&
                !warpRouteDetails &&
                !debugResult?.ismDetails && (
                  <p className="text-sm text-gray-500">
                    No additional application details were detected for this message.
                  </p>
                )}
            </>
          }
        />
      </div>
    </MessageDiagnosticsProvider>
  );
}

function isRuntimeStateEqual(a: MessageDetailsRuntimeState, b: MessageDetailsRuntimeState) {
  return (
    a.hasRun === b.hasRun &&
    a.isFetching === b.isFetching &&
    a.isError === b.isError &&
    a.isMessageFound === b.isMessageFound &&
    a.message === b.message &&
    a.debugResult === b.debugResult &&
    a.isDeliveryStatusFetching === b.isDeliveryStatusFetching &&
    a.collateralStatus === b.collateralStatus &&
    a.originConfirmationTimestamp?.blockNumber === b.originConfirmationTimestamp?.blockNumber &&
    a.originConfirmationTimestamp?.timestamp === b.originConfirmationTimestamp?.timestamp
  );
}

function hasCompleteMessageDetails(message?: Message | MessageStub | null): message is Message {
  if (!message) return false;
  return (
    'decodedBody' in message &&
    'totalGasAmount' in message &&
    'totalPayment' in message &&
    'numPayments' in message &&
    'blockHash' in message.origin &&
    'blockNumber' in message.origin &&
    'mailbox' in message.origin &&
    'gasLimit' in message.origin
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
