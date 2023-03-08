import Image from 'next/image';
import { useCallback, useEffect, useMemo } from 'react';
import { toast } from 'react-toastify';
import { useQuery } from 'urql';

import { Spinner } from '../../components/animation/Spinner';
import CheckmarkIcon from '../../images/icons/checkmark-circle.svg';
import { useStore } from '../../store';
import { Message, MessageStatus } from '../../types';
import { getChainDisplayName } from '../../utils/chains';
import { logger } from '../../utils/logger';
import { toTitleCase } from '../../utils/string';
import { useInterval } from '../../utils/useInterval';
import { useMessageDeliveryStatus } from '../deliveryStatus/useMessageDeliveryStatus';

import { ContentDetailsCard } from './cards/ContentDetailsCard';
import { IcaDetailsCard } from './cards/IcaDetailsCard';
import { TimelineCard } from './cards/TimelineCard';
import { TransactionCard, TransactionCardDebugInfo } from './cards/TransactionCard';
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
  const messages = useMemo(() => parseMessageQueryResult(data), [data]);

  // Extracting message properties
  const message = propMessage || messages[0] || PLACEHOLDER_MESSAGE;
  const isMessageFound = !!propMessage || messages.length > 0;
  const shouldBlur = !isMessageFound;
  const {
    status,
    originChainId,
    destinationChainId: destChainId,
    originTransaction,
    destinationTransaction: destTransaction,
  } = message;
  const isIcaMsg = isIcaMessage(message);

  // Message status query + resolution
  const { data: deliveryStatusResponse } = useMessageDeliveryStatus(message, isMessageFound);
  let resolvedDestTx = destTransaction;
  let resolvedMsgStatus = status;
  let debugInfo: TransactionCardDebugInfo | undefined = undefined;
  // If there's a delivery status response, use those values instead
  if (deliveryStatusResponse) {
    resolvedMsgStatus = deliveryStatusResponse.status;
    if (deliveryStatusResponse.status === MessageStatus.Delivered) {
      resolvedDestTx = deliveryStatusResponse.deliveryTransaction;
    } else if (deliveryStatusResponse.status === MessageStatus.Failing) {
      debugInfo = {
        status: deliveryStatusResponse.debugStatus,
        details: deliveryStatusResponse.debugDetails,
        originChainId,
        originTxHash: originTransaction.transactionHash,
      };
    }
  }

  // Query re-executor
  const reExecutor = useCallback(() => {
    if (propMessage || (isMessageFound && resolvedMsgStatus !== MessageStatus.Delivered)) return;
    reexecuteQuery({ requestPolicy: 'network-only' });
  }, [propMessage, isMessageFound, resolvedMsgStatus, reexecuteQuery]);
  useInterval(reExecutor, AUTO_REFRESH_DELAY);

  // Banner color setter
  const setBanner = useStore((s) => s.setBanner);
  useEffect(() => {
    if (isFetching) return;
    if (error) {
      logger.error('Error fetching message details', error);
      toast.error(`Error fetching message: ${error.message?.substring(0, 30)}`);
      setBanner('bg-red-500');
    } else if (resolvedMsgStatus === MessageStatus.Failing) {
      setBanner('bg-red-500');
    } else if (!isMessageFound) {
      setBanner('bg-gray-500');
    } else {
      setBanner('');
    }
  }, [error, isFetching, resolvedMsgStatus, isMessageFound, setBanner]);
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
          messageStatus={resolvedMsgStatus}
          isMessageFound={isMessageFound}
          isFetching={isFetching}
          isError={!!error}
        />
      </div>
      <div className="flex flex-wrap items-stretch justify-between mt-5 gap-4">
        <TransactionCard
          title="Origin Transaction"
          chainId={originChainId}
          status={resolvedMsgStatus}
          transaction={originTransaction}
          helpText={helpText.origin}
          shouldBlur={shouldBlur}
        />
        <TransactionCard
          title="Destination Transaction"
          chainId={destChainId}
          status={resolvedMsgStatus}
          transaction={resolvedDestTx}
          debugInfo={debugInfo}
          helpText={helpText.destination}
          shouldBlur={shouldBlur}
        />
        {!message.isPiMsg && (
          <TimelineCard
            message={message}
            resolvedStatus={resolvedMsgStatus}
            resolvedDestinationTx={resolvedDestTx}
            shouldBlur={shouldBlur}
          />
        )}
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
