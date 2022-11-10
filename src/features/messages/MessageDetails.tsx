import Image from 'next/future/image';
import { useCallback, useEffect, useMemo } from 'react';
import { toast } from 'react-toastify';
import { useQuery } from 'urql';

import { Spinner } from '../../components/animation/Spinner';
import CheckmarkIcon from '../../images/icons/checkmark-circle.svg';
import ErrorCircleIcon from '../../images/icons/error-circle.svg';
import { useStore } from '../../store';
import { MessageStatus } from '../../types';
import { getChainDisplayName } from '../../utils/chains';
import { logger } from '../../utils/logger';
import { toTitleCase } from '../../utils/string';
import { useInterval } from '../../utils/timeout';
import { useMessageDeliveryStatus } from '../deliveryStatus/useMessageDeliveryStatus';

import { ContentDetailsCard } from './cards/ContentDetailsCard';
import { IcaDetailsCard } from './cards/IcaDetailsCard';
import { TimelineCard } from './cards/TimelineCard';
import { TransactionCard, TransactionCardDebugInfo } from './cards/TransactionCard';
import { isIcaMessage } from './ica';
import { PLACEHOLDER_MESSAGE } from './placeholderMessages';
import { parseMessageQueryResult } from './query';
import type { MessagesQueryResult } from './types';

const AUTO_REFRESH_DELAY = 10000;

export function MessageDetails({ messageId }: { messageId: string }) {
  // Message query
  const [graphResult, reexecuteQuery] = useQuery<MessagesQueryResult>({
    query: messageDetailsQuery,
    variables: { messageId },
  });
  const { data, fetching: isFetching, error } = graphResult;
  const messages = useMemo(() => parseMessageQueryResult(data), [data]);

  // Extracting message properties
  const isMessageFound = messages.length > 0;
  const shouldBlur = !isMessageFound;
  const message = isMessageFound ? messages[0] : PLACEHOLDER_MESSAGE;
  const {
    status,
    originChainId,
    destinationChainId: destChainId,
    originTimestamp,
    destinationTimestamp,
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
    if (!isMessageFound || resolvedMsgStatus !== MessageStatus.Delivered) {
      reexecuteQuery({ requestPolicy: 'network-only' });
    }
  }, [isMessageFound, resolvedMsgStatus, reexecuteQuery]);
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
        <TimelineCard
          message={message}
          resolvedStatus={resolvedMsgStatus}
          shouldBlur={shouldBlur}
        />
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
    icon = <Image src={ErrorCircleIcon} width={24} height={24} className="invert" alt="" />;
  }

  return (
    <div className="flex items-center">
      <h3 className="text-white text-lg mr-3">{text}</h3>
      {icon}
    </div>
  );
}

const messageDetailsQuery = `
query MessageDetails ($messageId: bigint!){
  message(where: {id: {_eq: $messageId}}, limit: 1) {
    destination
    id
    leaf_index
    hash
    msg_body
    origin
    origin_tx_id
    transaction {
      id
      block_id
      gas_used
      hash
      sender
      block {
        hash
        domain
        height
        id
        timestamp
      }
    }
    outbox_address
    recipient
    sender
    timestamp
    delivered_message {
      id
      tx_id
      inbox_address
      transaction {
        block_id
        gas_used
        hash
        id
        sender
        block {
          domain
          hash
          height
          id
          timestamp
        }
      }
    }
    message_states {
      block_height
      block_timestamp
      error_msg
      estimated_gas_cost
      id
      processable
    }
  }
}`;

const helpText = {
  origin: 'Info about the transaction that initiated the message placement into the outbox.',
  destination:
    'Info about the transaction that triggered the delivery of the message from an inbox.',
};
