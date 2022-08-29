import Image from 'next/future/image';
import { PropsWithChildren, useCallback, useEffect, useMemo } from 'react';
import { toast } from 'react-toastify';
import { useQuery } from 'urql';

import { Spinner } from '../../components/animation/Spinner';
import { CopyButton } from '../../components/buttons/CopyButton';
import { ChainIcon } from '../../components/icons/ChainIcon';
import { ChainToChain } from '../../components/icons/ChainToChain';
import { HelpIcon } from '../../components/icons/HelpIcon';
import { useBackgroundBanner } from '../../components/layout/BackgroundBanner';
import { Card } from '../../components/layout/Card';
import CheckmarkIcon from '../../images/icons/checkmark-circle.svg';
import ErrorCircleIcon from '../../images/icons/error-circle.svg';
import { MessageStatus } from '../../types';
import { logger } from '../../utils/logger';
import { getHumanReadableTimeString } from '../../utils/time';
import { useInterval } from '../../utils/timeout';

import { PLACEHOLDER_MESSAGES } from './placeholderMessages';
import { parseResultData } from './query';
import { MessagesQueryResult } from './types';

const AUTO_REFRESH_DELAY = 10000;

export function MessageDetails({ messageId }: { messageId: string }) {
  const [result, reexecuteQuery] = useQuery<MessagesQueryResult>({
    query: messageQuery,
    variables: { messageId: parseInt(messageId) },
  });

  const { data, fetching, error } = result;
  const messages = useMemo(() => parseResultData(data), [data]);

  const isMessageFound = messages.length > 0;
  const shouldBlur = !isMessageFound || fetching;
  const message = isMessageFound ? messages[0] : PLACEHOLDER_MESSAGES[0];
  const {
    status,
    body,
    sender,
    recipient,
    originTimeSent,
    originChainId,
    destinationChainId,
    originTransaction,
    destinationTransaction,
  } = message;

  const { bannerClassName, setBannerClassName } = useBackgroundBanner();
  useEffect(() => {
    if (!setBannerClassName || fetching) return;
    if (error) {
      logger.error('Error fetching message details', error);
      toast.error(`Error fetching message: ${error.message?.substring(0, 30)}`);
      setBannerClassName('bg-red-600');
    } else if (message.status === MessageStatus.Failing) {
      setBannerClassName('bg-red-600');
    } else if (!isMessageFound) {
      setBannerClassName('bg-gray-500');
    } else if (bannerClassName) {
      setBannerClassName('');
    }
  }, [
    error,
    fetching,
    message,
    isMessageFound,
    bannerClassName,
    setBannerClassName,
  ]);

  const reExecutor = useCallback(() => {
    if (!isMessageFound || status !== MessageStatus.Delivered) {
      reexecuteQuery({ requestPolicy: 'network-only' });
    }
  }, [isMessageFound, status, reexecuteQuery]);
  useInterval(reExecutor, AUTO_REFRESH_DELAY);

  return (
    <>
      <div className="flex items-center justify-between px-1 -mt-1">
        <h2 className="text-white text-lg">Message</h2>
        {isMessageFound && status === MessageStatus.Pending && (
          <StatusHeader text="Status: Pending" fetching={fetching} />
        )}
        {isMessageFound && status === MessageStatus.Delivered && (
          <StatusHeader text="Status: Delivered" fetching={fetching}>
            <Image src={CheckmarkIcon} alt="checkmark" width={24} height={24} />
          </StatusHeader>
        )}
        {isMessageFound && status === MessageStatus.Failing && (
          <StatusHeader text="Status: Failing" fetching={fetching}>
            <ErrorIcon />
          </StatusHeader>
        )}
        {!isMessageFound && !error && (
          <StatusHeader text="Message not found" fetching={fetching}>
            <ErrorIcon />
          </StatusHeader>
        )}
        {!isMessageFound && error && (
          <StatusHeader text="Error finding message" fetching={fetching}>
            <ErrorIcon />
          </StatusHeader>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between mt-5 gap-4">
        <Card classes="flex-1 min-w-fit space-y-4">
          <div className="flex items-center justify-between">
            <div className="relative -top-px -left-0.5">
              <ChainIcon chainId={originChainId} />
            </div>
            <div className="flex items-center pb-1">
              <h3 className="text-gray-500 font-medium text-md mr-2">
                Origin Transaction
              </h3>
              <HelpIcon size={16} text={helpText.origin} />
            </div>
          </div>
          <ValueRow
            label="Tx hash:"
            labelWidth="w-16"
            display={originTransaction.transactionHash}
            displayWidth="w-44 sm:w-56"
            showCopy={true}
            blurValue={shouldBlur}
          />
          <ValueRow
            label="From:"
            labelWidth="w-16"
            display={originTransaction.from}
            displayWidth="w-44 sm:w-56"
            showCopy={true}
            blurValue={shouldBlur}
          />
          <ValueRow
            label="Block:"
            labelWidth="w-16"
            display={`${
              originTransaction.blockNumber
            } (${getHumanReadableTimeString(originTimeSent)})`}
            displayWidth="w-44 sm:w-56"
            blurValue={shouldBlur}
          />
          <a
            className="block text-sm text-gray-500 pl-px underline"
            href="TODO"
            target="_blank"
            rel="noopener noreferrer"
          >
            View in block explorer
          </a>
        </Card>
        <Card classes="flex-1 min-w-fit space-y-4">
          <div className="flex items-center justify-between">
            <div className="relative -top-px -left-0.5">
              <ChainIcon chainId={destinationChainId} />
            </div>
            <div className="flex items-center pb-1">
              <h3 className="text-gray-500 font-medium text-md mr-2">
                Destination Transaction
              </h3>
              <HelpIcon size={16} text={helpText.destination} />
            </div>
          </div>
          {destinationTransaction ? (
            <>
              <ValueRow
                label="Tx hash:"
                labelWidth="w-16"
                display={originTransaction.transactionHash}
                displayWidth="w-44 sm:w-56"
                showCopy={true}
                blurValue={shouldBlur}
              />
              <ValueRow
                label="From:"
                labelWidth="w-16"
                display={originTransaction.from}
                displayWidth="w-44 sm:w-56"
                showCopy={true}
                blurValue={shouldBlur}
              />
              <ValueRow
                label="Block:"
                labelWidth="w-16"
                display={`${
                  originTransaction.blockNumber
                } (${getHumanReadableTimeString(originTimeSent)})`}
                displayWidth="w-44 sm:w-56"
                blurValue={shouldBlur}
              />
              <a
                className="block text-sm text-gray-500 pl-px underline"
                href="TODO"
                target="_blank"
                rel="noopener noreferrer"
              >
                View in block explorer
              </a>
            </>
          ) : (
            <div className="flex flex-col items-center py-6">
              <div className="text-gray-500">
                {status === MessageStatus.Failing
                  ? 'Destination chain transaction currently failing'
                  : 'Destination chain transaction still in progress'}
              </div>
              <Spinner classes="mt-4" />
            </div>
          )}
        </Card>
      </div>
      <Card classes="mt-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="relative -top-px -left-0.5">
            <ChainToChain
              originChainId={originChainId}
              destinationChainId={destinationChainId}
            />
          </div>
          <div className="flex items-center pb-1">
            <h3 className="text-gray-500 font-medium text-md mr-2">
              Message Details
            </h3>
            <HelpIcon size={16} text={helpText.details} />
          </div>
        </div>
        <ValueRow
          label="Sender to outbox:"
          labelWidth="w-24 sm:w-36"
          display={sender}
          displayWidth="w-48 sm:w-80"
          showCopy={true}
          blurValue={shouldBlur}
        />
        <ValueRow
          label="Recipient from outbox:"
          labelWidth="w-24 sm:w-36"
          display={recipient}
          displayWidth="w-48 sm:w-80"
          showCopy={true}
          blurValue={shouldBlur}
        />
        <div>
          <label className="text-sm text-gray-500">Message content:</label>
          <div className="relative max-w-full break-words py-2 pl-2 pr-9 mt-2 bg-gray-100 text-sm font-mono rounded">
            {body}
            <CopyButton
              copyValue={body}
              width={15}
              height={15}
              classes="absolute top-2 right-2 opacity-70"
            />
          </div>
        </div>
      </Card>
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
      {fetching || !children ? (
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

function ValueRow({
  label,
  labelWidth,
  display,
  displayWidth,
  showCopy,
  blurValue,
}: {
  label: string;
  labelWidth: string;
  display: string;
  displayWidth: string;
  showCopy?: boolean;
  blurValue?: boolean;
}) {
  return (
    <div className="flex items-center pl-px">
      <label className={`text-sm text-gray-500 ${labelWidth}`}>{label}</label>
      <span
        className={`text-sm ml-2 truncate ${displayWidth} ${
          blurValue && 'blur-xs'
        }`}
      >
        {display}
      </span>
      {showCopy && (
        <CopyButton
          copyValue={display}
          width={15}
          height={15}
          classes="ml-3 opacity-50"
        />
      )}
    </div>
  );
}

function ErrorIcon() {
  return (
    <Image
      src={ErrorCircleIcon}
      alt="failure"
      width={24}
      height={24}
      className="invert"
    />
  );
}

const messageQuery = `
query message ($messageId: Int!) {
  messages(where: {id: {_eq: $messageId}}, limit: 1) {
    id
    destinationtimesent
    destinationchainid
    body
    originchainid
    origintimesent
    recipient
    status
    sender
  }
}`;

const helpText = {
  origin:
    'Info about the transaction that initiated the message placement into the outbox.',
  destination:
    'Info about the transaction that triggered the delivery of the message from an inbox.',
  details:
    'Immutable information about the message itself such as its contents.',
};
