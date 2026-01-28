import { toTitleCase, trimToLength } from '@hyperlane-xyz/utils';
import { SpinnerIcon } from '@hyperlane-xyz/widgets';
import Image from 'next/image';
import Link from 'next/link';
import { useMemo } from 'react';

import { ChainLogo } from '../../components/icons/ChainLogo';
import CheckmarkIcon from '../../images/icons/checkmark-circle.svg';
import { useMultiProvider, useStore } from '../../store';
import { Message, MessageStatus } from '../../types';
import { getHumanReadableDuration } from '../../utils/time';
import { getChainDisplayName } from '../chains/utils';
import { decodeIcaBody, IcaMessageType, isIcaMessage } from '../messages/ica';
import { parseWarpRouteMessageDetails } from '../messages/utils';

interface Props {
  message: Message;
  index: number;
}

type MessageType = 'warp' | 'ica-commitment' | 'ica-reveal' | 'ica-calls' | 'generic';

export function MessageSummaryRow({ message, index }: Props) {
  const multiProvider = useMultiProvider();
  const warpRouteChainAddressMap = useStore((s) => s.warpRouteChainAddressMap);

  // Use message data directly from GraphQL - no additional RPC calls for performance
  const { status, originDomainId, destinationDomainId, destination } = message;

  // Parse warp route details
  const warpRouteDetails = useMemo(
    () => parseWarpRouteMessageDetails(message, warpRouteChainAddressMap, multiProvider),
    [message, warpRouteChainAddressMap, multiProvider],
  );

  // Detect message type
  const { messageType, icaDecoded } = useMemo(() => {
    // Check warp route first
    if (warpRouteDetails) {
      return { messageType: 'warp' as MessageType, icaDecoded: null };
    }

    // Check ICA
    if (isIcaMessage({ sender: message.sender, recipient: message.recipient })) {
      const decoded = decodeIcaBody(message.body);
      if (decoded) {
        if (decoded.messageType === IcaMessageType.COMMITMENT) {
          return { messageType: 'ica-commitment' as MessageType, icaDecoded: decoded };
        }
        if (decoded.messageType === IcaMessageType.REVEAL) {
          return { messageType: 'ica-reveal' as MessageType, icaDecoded: decoded };
        }
        if (decoded.messageType === IcaMessageType.CALLS) {
          return { messageType: 'ica-calls' as MessageType, icaDecoded: decoded };
        }
      }
    }

    return { messageType: 'generic' as MessageType, icaDecoded: null };
  }, [message, warpRouteDetails]);

  const originChainName = multiProvider.tryGetChainName(originDomainId) || 'Unknown';
  const destinationChainName = multiProvider.tryGetChainName(destinationDomainId) || 'Unknown';

  const duration = destination?.timestamp
    ? getHumanReadableDuration(destination.timestamp - message.origin.timestamp, 2)
    : undefined;

  // Generate summary line based on message type
  const summaryLine = useMemo(() => {
    const route = `${getChainDisplayName(multiProvider, originChainName, true)} → ${getChainDisplayName(multiProvider, destinationChainName, true)}`;

    switch (messageType) {
      case 'warp':
        return `${warpRouteDetails?.amount} ${warpRouteDetails?.originToken?.symbol} · ${route}`;
      case 'ica-commitment':
        return `${trimToLength(icaDecoded?.commitment || message.msgId, 12)} · ${route}`;
      case 'ica-reveal':
        return `Reveal · ${route}`;
      case 'ica-calls':
        return `${icaDecoded?.calls?.length || 0} calls · ${route}`;
      default:
        return route;
    }
  }, [
    messageType,
    warpRouteDetails,
    icaDecoded,
    multiProvider,
    originChainName,
    destinationChainName,
    message.msgId,
  ]);

  // Generate title based on message type
  const title = useMemo(() => {
    switch (messageType) {
      case 'warp':
        return 'Warp Transfer';
      case 'ica-commitment':
        return 'ICA Commitment';
      case 'ica-reveal':
        return 'ICA Reveal';
      case 'ica-calls':
        return 'ICA Calls';
      default:
        return 'Message';
    }
  }, [messageType]);

  return (
    <Link
      href={`/message/${message.msgId}`}
      className="block rounded-lg border border-gray-200 bg-white transition-colors hover:border-gray-300 hover:bg-gray-50"
    >
      <div className="flex w-full items-center justify-between p-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="shrink-0 text-sm font-medium text-gray-500">#{index + 1}</span>
          <ChainLogo chainName={destinationChainName} size={20} />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-800">{title}</span>
            </div>
            <p className="truncate text-xs text-gray-500">{summaryLine}</p>
          </div>
        </div>
        <StatusBadge status={status} duration={duration} />
      </div>
    </Link>
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
