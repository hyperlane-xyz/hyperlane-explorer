import { toTitleCase, trimToLength } from '@hyperlane-xyz/utils';
import { ChevronIcon, SpinnerIcon } from '@hyperlane-xyz/widgets';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { ChainLogo } from '../../components/icons/ChainLogo';
import CheckmarkIcon from '../../images/icons/checkmark-circle.svg';
import { useChainMetadataResolver, useStore } from '../../metadataStore';
import { Message, MessageStatus } from '../../types';
import { getHumanReadableDuration } from '../../utils/time';
import { getChainDisplayName } from '../chains/utils';
import { ContentDetailsCard } from '../messages/cards/ContentDetailsCard';
import { IcaDetailsCard } from '../messages/cards/IcaDetailsCard';
import { DestinationTransactionCard } from '../messages/cards/TransactionCard';
import { WarpTransferDetailsCard } from '../messages/cards/WarpTransferDetailsCard';
import { isIcaMessage } from '../messages/ica';
import { parseWarpRouteMessageDetails } from '../messages/utils';

interface Props {
  message: Message;
  index: number;
  forceExpanded?: boolean;
}

type MessageType = 'warp' | 'ica' | 'generic';

export function MessageSummaryRow({ message, index, forceExpanded }: Props) {
  const [isManuallyToggled, setIsManuallyToggled] = useState(false);
  const [manualExpandState, setManualExpandState] = useState(false);

  // Use forceExpanded unless user has manually toggled
  const isExpanded = isManuallyToggled ? manualExpandState : (forceExpanded ?? false);

  const handleToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsManuallyToggled(true);
    setManualExpandState((prev) => !prev);
  };

  // Reset manual toggle when forceExpanded changes
  useEffect(() => {
    setIsManuallyToggled(false);
  }, [forceExpanded]);

  const chainMetadataResolver = useChainMetadataResolver();
  const warpRouteChainAddressMap = useStore((s) => s.warpRouteChainAddressMap);

  // Use message data directly from GraphQL - no additional RPC calls for performance
  const { status, originDomainId, destinationDomainId, destination } = message;

  // Parse warp route details
  const warpRouteDetails = useMemo(
    () => parseWarpRouteMessageDetails(message, warpRouteChainAddressMap, chainMetadataResolver),
    [message, warpRouteChainAddressMap, chainMetadataResolver],
  );

  // Detect message type
  const { messageType } = useMemo(() => {
    // Check warp route first
    if (warpRouteDetails) {
      return { messageType: 'warp' as MessageType };
    }

    if (isIcaMessage({ sender: message.sender, recipient: message.recipient })) {
      return { messageType: 'ica' as MessageType };
    }

    return { messageType: 'generic' as MessageType };
  }, [message, warpRouteDetails]);

  const originChainName = chainMetadataResolver.tryGetChainName(originDomainId) || 'Unknown';
  const destinationChainName =
    chainMetadataResolver.tryGetChainName(destinationDomainId) || 'Unknown';

  const duration = destination?.timestamp
    ? getHumanReadableDuration(destination.timestamp - message.origin.timestamp, 2)
    : undefined;

  // Generate summary line based on message type
  const summaryLine = useMemo(() => {
    const route = `${getChainDisplayName(chainMetadataResolver, originChainName, true)} to ${getChainDisplayName(chainMetadataResolver, destinationChainName, true)}`;

    switch (messageType) {
      case 'warp':
        return `${warpRouteDetails?.amount} ${warpRouteDetails?.originToken?.symbol} - ${route}`;
      case 'ica':
        return `ICA ${trimToLength(message.msgId, 12)} - ${route}`;
      default:
        return route;
    }
  }, [
    messageType,
    warpRouteDetails,
    chainMetadataResolver,
    originChainName,
    destinationChainName,
    message,
  ]);

  // Generate title based on message type
  const title = useMemo(() => {
    switch (messageType) {
      case 'warp':
        return 'Warp Transfer';
      case 'ica':
        return 'Interchain Account Message';
      default:
        return 'Message';
    }
  }, [messageType]);

  const isIcaMsg = messageType === 'ica';

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      {/* Summary Row (always visible) */}
      <div
        className="flex w-full cursor-pointer items-center justify-between p-3"
        onClick={handleToggle}
      >
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="shrink-0 text-sm font-medium text-gray-500">#{index + 1}</span>
          <ChainLogo chainName={destinationChainName} size={20} />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-800">{title}</span>
              <Link
                href={`/message/${message.msgId}`}
                onClick={(e) => e.stopPropagation()}
                className="text-xs text-blue-500 transition-colors hover:text-blue-600"
              >
                ↗
              </Link>
            </div>
            <p className="truncate text-xs text-gray-500">{summaryLine}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <StatusBadge status={status} duration={duration} />
          <ChevronIcon
            width={18}
            height={18}
            direction={isExpanded ? 'n' : 's'}
            className="text-gray-400"
          />
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="space-y-4 border-t border-gray-200 p-4">
          {/* Destination Transaction Card */}
          <DestinationTransactionCard
            chainName={destinationChainName}
            domainId={destinationDomainId}
            status={status}
            transaction={destination}
            isStatusFetching={false}
            blur={false}
            message={message}
            warpRouteDetails={warpRouteDetails}
          />

          {/* Warp Transfer Details */}
          {messageType === 'warp' && warpRouteDetails && (
            <WarpTransferDetailsCard
              message={message}
              warpRouteDetails={warpRouteDetails}
              blur={false}
            />
          )}

          {/* ICA Details */}
          {isIcaMsg && <IcaDetailsCard message={message} blur={false} />}

          {/* Content Details - only show if no decoded content (warp/ICA) */}
          {messageType === 'generic' && <ContentDetailsCard message={message} blur={false} />}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status, duration }: { status: MessageStatus; duration?: string }) {
  if (status === MessageStatus.Delivered) {
    return (
      <div className="flex items-center gap-1.5 rounded-full bg-green-100 px-2.5 py-1">
        <Image src={CheckmarkIcon} width={14} height={14} alt="" />
        <span className="text-xs font-medium text-green-700">
          Delivered{duration && ` (${duration})`}
        </span>
      </div>
    );
  }

  if (status === MessageStatus.Failing) {
    return (
      <div className="flex items-center gap-1.5 rounded-full bg-red-100 px-2.5 py-1">
        <span className="text-xs font-medium text-red-700">Failing</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1">
      <SpinnerIcon width={14} height={14} color="#b45309" />
      <span className="text-xs font-medium text-amber-700">{toTitleCase(status)}</span>
    </div>
  );
}
