import Image from 'next/image';
import { useCallback, useEffect, useMemo } from 'react';
import { toast } from 'react-toastify';
import { useQuery } from 'urql';

import { Spinner } from '../../components/animation/Spinner';
import CheckmarkIcon from '../../images/icons/checkmark-circle.svg';
import { useStore } from '../../store';
import { Message, MessageStatus } from '../../types';
import { logger } from '../../utils/logger';
import { toTitleCase } from '../../utils/string';
import { useInterval } from '../../utils/useInterval';
import { getChainDisplayName } from '../chains/utils';
import { useMessageDeliveryStatus } from '../deliveryStatus/useMessageDeliveryStatus';

import { ContentDetailsCard } from './cards/ContentDetailsCard';
import { IcaDetailsCard } from './cards/IcaDetailsCard';
import { TimelineCard } from './cards/TimelineCard';
import { TransactionCard } from './cards/TransactionCard';
import { isIcaMessage } from './ica';
import { PLACEHOLDER_MESSAGE } from './placeholderMessages';
import { MessageIdentifierType, buildMessageQuery } from './queries/build';
import { MessagesQueryResult } from './queries/fragments';
import { parseMessageQueryResult } from './queries/parse';

const AUTO_REFRESH_DELAY = 10000;

interface Props {
  messageId: string; // Hex value for message id
  message?: Message; // If provided, component will use this data instead of querying
}

export function MessageDetails({ messageId, message: propMessage }: Props) {
  // Message query
  const { query, variables } = buildMessageQuery(MessageIdentifierType.Id, messageId, 1);
  const [{ data, fetching: isFetching, error }, reexecuteQuery] = useQuery<MessagesQueryResult>({
    query,
    variables,
    pause: !!propMessage,
  });
  const graphQueryMessages = useMemo(() => parseMessageQueryResult(data), [data]);

  // Extracting message properties
  const message = propMessage || graphQueryMessages[0] || PLACEHOLDER_MESSAGE;
  const isMessageFound = !!propMessage || graphQueryMessages.length > 0;
  const shouldBlur = !isMessageFound;
  const isIcaMsg = isIcaMessage(message);

  // If message isn't delivered, query delivery-status api for
  // more recent update and possibly debug info
  const { messageWithDeliveryStatus, debugInfo } = useMessageDeliveryStatus(
    message,
    isMessageFound,
  );

  const {
    status,
    originChainId,
    destinationChainId: destChainId,
    origin,
    destination,
  } = messageWithDeliveryStatus;

  // Query re-executor
  const reExecutor = useCallback(() => {
    if (propMessage || (isMessageFound && status !== MessageStatus.Delivered)) return;
    reexecuteQuery({ requestPolicy: 'network-only' });
  }, [propMessage, isMessageFound, status, reexecuteQuery]);
  useInterval(reExecutor, AUTO_REFRESH_DELAY);

  // Banner color setter
  const setBanner = useStore((s) => s.setBanner);
  useEffect(() => {
    if (isFetching) return;
    if (error) {
      logger.error('Error fetching message details', error);
      toast.error(`Error fetching message: ${error.message?.substring(0, 30)}`);
      setBanner('bg-red-500');
    } else if (status === MessageStatus.Failing) {
      setBanner('bg-red-500');
    } else if (!isMessageFound) {
      setBanner('bg-gray-500');
    } else {
      setBanner('');
    }
  }, [error, isFetching, status, isMessageFound, setBanner]);
  useEffect(() => {
    return () => setBanner('');
  }, [setBanner]);

  return (
    <>
      <div className="flex items-center justify-between px-1">
        <h2 className="text-white text-lg">{`${
          isIcaMsg ? 'ICA ' : ''
        } Message to ${getChainDisplayName(destChainId)}`}</h2>
        <StatusHeader
          messageStatus={status}
          isMessageFound={isMessageFound}
          isFetching={isFetching}
          isError={!!error}
        />
      </div>
      <div className="flex flex-wrap items-stretch justify-between mt-5 gap-4">
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

const helpText = {
  origin: 'Info about the transaction that initiated the message placement into the outbox.',
  destination:
    'Info about the transaction that triggered the delivery of the message from an inbox.',
};
