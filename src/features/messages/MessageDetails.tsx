import Image from 'next/image';
import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';

import { Spinner } from '../../components/animation/Spinner';
import CheckmarkIcon from '../../images/icons/checkmark-circle.svg';
import { useStore } from '../../store';
import { Message, MessageStatus } from '../../types';
import { logger } from '../../utils/logger';
import { toTitleCase } from '../../utils/string';
import { getChainDisplayName } from '../chains/utils';
import { useMessageDeliveryStatus } from '../deliveryStatus/useMessageDeliveryStatus';
import { useMultiProvider } from '../providers/multiProvider';

import { ContentDetailsCard } from './cards/ContentDetailsCard';
import { GasDetailsCard } from './cards/GasDetailsCard';
import { IcaDetailsCard } from './cards/IcaDetailsCard';
import { TimelineCard } from './cards/TimelineCard';
import { TransactionCard } from './cards/TransactionCard';
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

  // Needed to force pause of message query if the useMessageDeliveryStatus
  // Hook finds a delivery record on it's own
  const [deliveryFound, setDeliveryFound] = useState(false);

  // GraphQL query and results
  const {
    isFetching: isGraphQlFetching,
    isError: isGraphQlError,
    hasRun: hasGraphQlRun,
    isMessageFound: isGraphQlMessageFound,
    message: messageFromGraphQl,
  } = useMessageQuery({ messageId, pause: !!messageFromUrlParams || deliveryFound });

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
  const shouldBlur = !isMessageFound;
  const isIcaMsg = useIsIcaMessage(_message);

  // If message isn't delivered, attempt to check for
  // more recent updates and possibly debug info
  const { messageWithDeliveryStatus: message, debugInfo } = useMessageDeliveryStatus({
    message: _message,
    pause: !isMessageFound,
  });

  const { status, originChainId, destinationChainId: destChainId, origin, destination } = message;

  // Mark delivery found to prevent pause queries
  useEffect(() => {
    if (status === MessageStatus.Delivered) setDeliveryFound(true);
  }, [status]);

  // Banner color setter
  useDynamicBannerColor(isFetching, status, isMessageFound, isError || isPiError);

  return (
    <>
      <div className="flex items-center justify-between px-1">
        <h2 className="text-white text-lg">{`${
          isIcaMsg ? 'ICA ' : ''
        } Message to ${getChainDisplayName(multiProvider, destChainId)}`}</h2>
        <StatusHeader
          messageStatus={status}
          isMessageFound={isMessageFound}
          isFetching={isFetching}
          isError={isError}
        />
      </div>
      <div className="flex flex-wrap items-stretch justify-between mt-5 gap-3">
        <TransactionCard
          title="Origin Transaction"
          chainId={originChainId}
          status={status}
          transaction={origin}
          helpText={helpText.origin}
          shouldBlur={shouldBlur}
        />
        <TransactionCard
          title="Destination Transaction"
          chainId={destChainId}
          status={status}
          transaction={destination}
          debugInfo={debugInfo}
          helpText={helpText.destination}
          shouldBlur={shouldBlur}
        />
        {!message.isPiMsg && <TimelineCard message={message} shouldBlur={shouldBlur} />}
        <ContentDetailsCard message={message} shouldBlur={shouldBlur} />
        <GasDetailsCard message={message} shouldBlur={shouldBlur} />
        {isIcaMsg && <IcaDetailsCard message={message} shouldBlur={shouldBlur} />}
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
      <div className="w-7 h-7 overflow-hidden flex items-center justify-center">
        <div className="scale-[35%]">
          <Spinner white={true} />
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
      <h3 className="text-white text-lg mr-3">{text}</h3>
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

const helpText = {
  origin: 'Info about the transaction that initiated the message placement into the outbox.',
  destination:
    'Info about the transaction that triggered the delivery of the message from an inbox.',
};
