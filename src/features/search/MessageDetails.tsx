import Image from 'next/future/image';
import Link from 'next/link';
import { PropsWithChildren, useCallback, useEffect, useMemo } from 'react';
import { toast } from 'react-toastify';
import { useQuery } from 'urql';

import { utils } from '@hyperlane-xyz/utils';

import { Spinner } from '../../components/animation/Spinner';
import { CopyButton } from '../../components/buttons/CopyButton';
import { ChainIcon } from '../../components/icons/ChainIcon';
import { ChainToChain } from '../../components/icons/ChainToChain';
import { HelpIcon } from '../../components/icons/HelpIcon';
import { Card } from '../../components/layout/Card';
import { chainToDomain } from '../../consts/domains';
import CheckmarkIcon from '../../images/icons/checkmark-circle.svg';
import ErrorCircleIcon from '../../images/icons/error-circle.svg';
import { useStore } from '../../store';
import { MessageStatus, PartialTransactionReceipt } from '../../types';
import { getChainDisplayName, getChainEnvironment } from '../../utils/chains';
import { getTxExplorerUrl } from '../../utils/explorers';
import { logger } from '../../utils/logger';
import { getDateTimeString, getHumanReadableTimeString } from '../../utils/time';
import { useInterval } from '../../utils/timeout';
import { debugStatusToDesc } from '../debugger/strings';
import { MessageDebugStatus } from '../debugger/types';
import { useMessageDeliveryStatus } from '../deliveryStatus/useMessageDeliveryStatus';

import { PLACEHOLDER_MESSAGES } from './placeholderMessages';
import { parseMessageQueryResult } from './query';
import type { MessagesQueryResult } from './types';

const AUTO_REFRESH_DELAY = 10000;

export function MessageDetails({ messageId }: { messageId: string }) {
  const [graphResult, reexecuteQuery] = useQuery<MessagesQueryResult>({
    query: messageDetailsQuery,
    variables: { messageId },
  });
  const { data, fetching: isFetching, error } = graphResult;
  const messages = useMemo(() => parseMessageQueryResult(data), [data]);

  const isMessageFound = messages.length > 0;
  const shouldBlur = !isMessageFound || isFetching;
  const message = isMessageFound ? messages[0] : PLACEHOLDER_MESSAGES[0];
  const {
    status,
    body,
    sender,
    recipient,
    originDomainId,
    destinationDomainId: destDomainId,
    originChainId,
    destinationChainId: destChainId,
    originTransaction,
    destinationTransaction: destTransaction,
    leafIndex,
    hash: msgHash,
  } = message;
  const msgRawBytes = utils.formatMessage(originDomainId, sender, destDomainId, recipient, body);

  const { data: deliveryStatusResponse, error: deliveryStatusError } = useMessageDeliveryStatus(
    message,
    isMessageFound,
  );

  let resolvedDestTx = destTransaction;
  let resolvedMsgStatus = status;
  let debugStatus: MessageDebugStatus | undefined = undefined;
  // If there's a delivery status response, use those values as s.o.t. instead
  if (deliveryStatusResponse) {
    resolvedMsgStatus = deliveryStatusResponse.status;
    if (deliveryStatusResponse.status === MessageStatus.Delivered) {
      resolvedDestTx = deliveryStatusResponse.deliveryTransaction;
    } else if (deliveryStatusResponse.status === MessageStatus.Failing) {
      debugStatus = deliveryStatusResponse.debugStatus;
    }
  }

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

    if (deliveryStatusError) {
      logger.error('Error fetching delivery status', deliveryStatusError);
      toast.error(`${deliveryStatusError}`);
    }

    return () => setBanner('');
  }, [error, deliveryStatusError, isFetching, resolvedMsgStatus, isMessageFound, setBanner]);

  const reExecutor = useCallback(() => {
    if (!isMessageFound || resolvedMsgStatus !== MessageStatus.Delivered) {
      reexecuteQuery({ requestPolicy: 'network-only' });
    }
  }, [isMessageFound, resolvedMsgStatus, reexecuteQuery]);
  useInterval(reExecutor, AUTO_REFRESH_DELAY);

  return (
    <>
      <div className="flex items-center justify-between px-1">
        <h2 className="text-white text-lg">Message</h2>
        {isMessageFound && resolvedMsgStatus === MessageStatus.Pending && (
          <StatusHeader text="Status: Pending" fetching={isFetching} />
        )}
        {isMessageFound && resolvedMsgStatus === MessageStatus.Delivered && (
          <StatusHeader text="Status: Delivered" fetching={isFetching}>
            <Image src={CheckmarkIcon} width={24} height={24} alt="" />
          </StatusHeader>
        )}
        {isMessageFound && resolvedMsgStatus === MessageStatus.Failing && (
          <StatusHeader text="Status: Failing" fetching={isFetching}>
            <ErrorIcon />
          </StatusHeader>
        )}
        {!isMessageFound && !error && (
          <StatusHeader text="Message not found" fetching={isFetching}>
            <ErrorIcon />
          </StatusHeader>
        )}
        {!isMessageFound && error && (
          <StatusHeader text="Error finding message" fetching={isFetching}>
            <ErrorIcon />
          </StatusHeader>
        )}
      </div>
      <div className="flex flex-wrap items-stretch justify-between mt-5 gap-4">
        <TransactionCard
          title="Origin Transaction"
          chainId={originChainId}
          status={resolvedMsgStatus}
          transaction={originTransaction}
          help={helpText.origin}
          shouldBlur={shouldBlur}
        />
        <TransactionCard
          title="Destination Transaction"
          chainId={destChainId}
          status={resolvedMsgStatus}
          transaction={resolvedDestTx}
          debugInfo={{
            status: debugStatus,
            originChainId: originChainId,
            originTxHash: originTransaction.transactionHash,
          }}
          help={helpText.destination}
          shouldBlur={shouldBlur}
        />
        <DetailsCard
          originChainId={originChainId}
          destinationChainId={destChainId}
          sender={sender}
          recipient={recipient}
          leafIndex={leafIndex}
          body={body}
          rawBytes={msgRawBytes}
          msgHash={msgHash}
          shouldBlur={shouldBlur}
        />
      </div>
    </>
  );
}

function StatusHeader({
  text,
  fetching,
  children,
}: PropsWithChildren<{ text: string; fetching: boolean }>) {
  return (
    <div className="flex items-center">
      <h3 className="text-white text-lg mr-3">{text}</h3>
      {fetching ? (
        <div className="w-7 h-7 overflow-hidden flex items-center justify-center">
          <div className="scale-[35%]">
            <Spinner white={true} />
          </div>
        </div>
      ) : (
        children
      )}
    </div>
  );
}

interface TransactionCardProps {
  title: string;
  chainId: number;
  status: MessageStatus;
  transaction?: PartialTransactionReceipt;
  debugInfo?: {
    status?: MessageDebugStatus;
    originChainId: number;
    originTxHash: string;
  };
  help: string;
  shouldBlur: boolean;
}

function TransactionCard({
  title,
  chainId,
  status,
  transaction,
  debugInfo,
  help,
  shouldBlur,
}: TransactionCardProps) {
  const txExplorerLink = getTxExplorerUrl(chainId, transaction?.transactionHash);
  return (
    <Card classes="flex-1 min-w-fit space-y-4">
      <div className="flex items-center justify-between">
        <div className="relative -top-px -left-0.5">
          <ChainIcon chainId={chainId} />
        </div>
        <div className="flex items-center pb-1">
          <h3 className="text-gray-500 font-medium text-md mr-2">{title}</h3>
          <HelpIcon size={16} text={help} />
        </div>
      </div>
      {transaction && (
        <>
          <ValueRow
            label="Chain:"
            labelWidth="w-16"
            display={`${getChainDisplayName(chainId)} (${chainId} / ${chainToDomain[chainId]})`}
            displayWidth="w-60 sm:w-64"
            blurValue={shouldBlur}
          />
          <ValueRow
            label="Tx hash:"
            labelWidth="w-16"
            display={transaction.transactionHash}
            displayWidth="w-60 sm:w-64"
            showCopy={true}
            blurValue={shouldBlur}
          />
          <ValueRow
            label="From:"
            labelWidth="w-16"
            display={transaction.from}
            displayWidth="w-60 sm:w-64"
            showCopy={true}
            blurValue={shouldBlur}
          />
          <ValueRow
            label="Time:"
            labelWidth="w-16"
            display={getHumanReadableTimeString(transaction.timestamp)}
            subDisplay={`(${getDateTimeString(transaction.timestamp)})`}
            displayWidth="w-60 sm:w-64"
            blurValue={shouldBlur}
          />
          <ValueRow
            label="Block:"
            labelWidth="w-16"
            display={transaction.blockNumber.toString()}
            displayWidth="w-60 sm:w-64"
            blurValue={shouldBlur}
          />
          {txExplorerLink && (
            <a
              className="block text-sm text-gray-500 pl-px underline"
              href={txExplorerLink}
              target="_blank"
              rel="noopener noreferrer"
            >
              View in block explorer
            </a>
          )}
        </>
      )}
      {!transaction && status === MessageStatus.Failing && (
        <div className="flex flex-col items-center py-5">
          <div className="text-gray-500">
            Destination chain delivery transaction currently failing
          </div>
          {debugInfo && (
            <>
              <div className="mt-4 text-gray-500">{`Failure reason: ${
                debugInfo.status ? debugStatusToDesc[debugInfo.status] : 'Unknown'
              }`}</div>
              <Link
                href={`/debugger?env=${getChainEnvironment(debugInfo.originChainId)}&txHash=${
                  debugInfo.originTxHash
                }`}
              >
                <a className="mt-6 block text-sm text-gray-500 pl-px underline">
                  View in transaction debugger
                </a>
              </Link>
            </>
          )}
        </div>
      )}
      {!transaction && status === MessageStatus.Pending && (
        <div className="flex flex-col items-center py-5">
          <div className="text-gray-500">Destination chain delivery transaction not yet found</div>
          <Spinner classes="mt-4 scale-75" />
        </div>
      )}
    </Card>
  );
}

interface DetailsCardProps {
  originChainId: number;
  destinationChainId: number;
  sender: string;
  recipient: string;
  leafIndex: number;
  body: string;
  rawBytes: string;
  msgHash: string;
  shouldBlur: boolean;
}

function DetailsCard({
  originChainId,
  destinationChainId,
  sender,
  recipient,
  leafIndex,
  body,
  rawBytes,
  msgHash,
  shouldBlur,
}: DetailsCardProps) {
  return (
    <Card classes="mt-2 space-y-4" width="w-full">
      <div className="flex items-center justify-between">
        <div className="relative -top-px -left-0.5">
          <ChainToChain originChainId={originChainId} destinationChainId={destinationChainId} />
        </div>
        <div className="flex items-center pb-1">
          <h3 className="text-gray-500 font-medium text-md mr-2">Message Details</h3>
          <HelpIcon size={16} text={helpText.details} />
        </div>
      </div>
      <ValueRow
        label="Sender:"
        labelWidth="w-20"
        display={sender}
        displayWidth="w-60 sm:w-80"
        showCopy={true}
        blurValue={shouldBlur}
      />
      <ValueRow
        label="Recipient:"
        labelWidth="w-20"
        display={recipient}
        displayWidth="w-60 sm:w-80"
        showCopy={true}
        blurValue={shouldBlur}
      />
      <ValueRow
        label="Leaf index:"
        labelWidth="w-20"
        display={leafIndex.toString()}
        displayWidth="w-60 sm:w-80"
        blurValue={shouldBlur}
      />
      <HexStringBlock label="Message content:" value={body} />
      <HexStringBlock label="Raw bytes:" value={rawBytes} />
      <HexStringBlock label="Message hash:" value={msgHash} />
    </Card>
  );
}

function ValueRow({
  label,
  labelWidth,
  display,
  displayWidth,
  subDisplay,
  showCopy,
  blurValue,
}: {
  label: string;
  labelWidth: string;
  display: string;
  displayWidth: string;
  subDisplay?: string;
  showCopy?: boolean;
  blurValue?: boolean;
}) {
  return (
    <div className="flex items-center pl-px">
      <label className={`text-sm text-gray-500 ${labelWidth}`}>{label}</label>
      <div className={`text-sm ml-2 truncate ${displayWidth} ${blurValue && 'blur-xs'}`}>
        <span>{display}</span>
        {subDisplay && <span className="text-xs ml-2">{subDisplay}</span>}
      </div>
      {showCopy && <CopyButton copyValue={display} width={15} height={15} classes="ml-3" />}
    </div>
  );
}

function HexStringBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <label className="text-sm text-gray-500">{label}</label>
      <div className="relative max-w-full break-words py-2 pl-2 pr-9 mt-2 bg-gray-100 text-sm font-mono rounded">
        {value}
        <CopyButton
          copyValue={value}
          width={15}
          height={15}
          classes="absolute top-2 right-2 opacity-70"
        />
      </div>
    </div>
  );
}

function ErrorIcon() {
  return <Image src={ErrorCircleIcon} width={24} height={24} className="invert" alt="" />;
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
  details: 'Immutable information about the message itself such as its contents.',
};
