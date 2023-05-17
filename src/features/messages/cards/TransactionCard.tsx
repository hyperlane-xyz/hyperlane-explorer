import { PropsWithChildren, ReactNode } from 'react';

import { Spinner } from '../../../components/animation/Spinner';
import { ChainLogo } from '../../../components/icons/ChainLogo';
import { HelpIcon } from '../../../components/icons/HelpIcon';
import { Card } from '../../../components/layout/Card';
import { MessageStatus, MessageTx } from '../../../types';
import { getDateTimeString, getHumanReadableTimeString } from '../../../utils/time';
import { getChainDisplayName } from '../../chains/utils';
import { debugStatusToDesc } from '../../debugger/strings';
import { MessageDebugResult } from '../../debugger/types';
import { useMultiProvider } from '../../providers/multiProvider';

import { KeyValueRow } from './KeyValueRow';

export function OriginTransactionCard({
  chainId,
  transaction,
  blur,
}: {
  chainId: ChainId;
  transaction: MessageTx;
  blur: boolean;
}) {
  return (
    <TransactionCard chainId={chainId} title="Origin Transaction" helpText={helpText.origin}>
      <TransactionDetails chainId={chainId} transaction={transaction} blur={blur} />
    </TransactionCard>
  );
}

export function DestinationTransactionCard({
  chainId,
  status,
  transaction,
  debugResult,
  isStatusFetching,
  isPiMsg,
  blur,
}: {
  chainId: ChainId;
  status: MessageStatus;
  transaction?: MessageTx;
  debugResult?: MessageDebugResult;
  isStatusFetching: boolean;
  isPiMsg?: boolean;
  blur: boolean;
}) {
  let content: ReactNode;
  if (transaction) {
    content = <TransactionDetails chainId={chainId} transaction={transaction} blur={blur} />;
  } else if (!debugResult && isStatusFetching) {
    content = (
      <DeliveryStatus>
        <div>Checking delivery status and inspecting message</div>
        <Spinner classes="mt-4 scale-75" />
      </DeliveryStatus>
    );
  } else if (status === MessageStatus.Failing) {
    content = (
      <DeliveryStatus>
        <div className="text-gray-700">Delivery to destination chain is currently failing</div>
        {debugResult && (
          <>
            <div className="mt-4 text-gray-700 text-center">
              {debugStatusToDesc[debugResult.status]}
            </div>
            <div className="mt-4 text-gray-700 text-sm max-w-sm text-center break-words">
              {debugResult.description}
            </div>
          </>
        )}
      </DeliveryStatus>
    );
  } else if (status === MessageStatus.Pending) {
    content = (
      <DeliveryStatus>
        <div>Delivery to destination chain still in progress.</div>
        {isPiMsg && (
          <div className="mt-2 text-gray-700 text-sm max-w-xs">
            Please ensure a relayer is running for this chain.
          </div>
        )}
        <Spinner classes="mt-4 scale-75" />
      </DeliveryStatus>
    );
  } else {
    content = (
      <DeliveryStatus>
        <div className="text-gray-700">{`Delivery to status is currently unknown. ${
          isPiMsg
            ? 'Please ensure your chain config is correct and check back later.'
            : 'Please check again later'
        }`}</div>
      </DeliveryStatus>
    );
  }

  return (
    <TransactionCard
      chainId={chainId}
      title="Destination Transaction"
      helpText={helpText.destination}
    >
      {content}
    </TransactionCard>
  );
}

function TransactionCard({
  chainId,
  title,
  helpText,
  children,
}: PropsWithChildren<{ chainId: ChainId; title: string; helpText: string }>) {
  return (
    <Card classes="flex-1 min-w-fit space-y-3">
      <div className="flex items-center justify-between">
        <div className="relative -top-px -left-0.5">
          <ChainLogo chainId={chainId} />
        </div>
        <div className="flex items-center pb-1">
          <h3 className="text-gray-500 font-medium text-md mr-2">{title}</h3>
          <HelpIcon size={16} text={helpText} />
        </div>
      </div>
      {children}
    </Card>
  );
}

function TransactionDetails({
  chainId,
  transaction,
  blur,
}: {
  chainId: ChainId;
  transaction: MessageTx;
  blur: boolean;
}) {
  const { hash, from, timestamp, blockNumber } = transaction;
  const multiProvider = useMultiProvider();
  const txExplorerLink = hash ? multiProvider.tryGetExplorerTxUrl(chainId, { hash }) : null;
  return (
    <>
      <KeyValueRow
        label="Chain:"
        labelWidth="w-16"
        display={`${getChainDisplayName(multiProvider, chainId)} (${chainId})`}
        displayWidth="w-60 sm:w-64"
        blurValue={blur}
      />
      <KeyValueRow
        label="Tx hash:"
        labelWidth="w-16"
        display={hash}
        displayWidth="w-60 sm:w-64"
        showCopy={true}
        blurValue={blur}
      />
      <KeyValueRow
        label="From:"
        labelWidth="w-16"
        display={from}
        displayWidth="w-60 sm:w-64"
        showCopy={true}
        blurValue={blur}
      />
      <KeyValueRow
        label="Time:"
        labelWidth="w-16"
        display={getHumanReadableTimeString(timestamp)}
        subDisplay={`(${getDateTimeString(timestamp)})`}
        displayWidth="w-60 sm:w-64"
        blurValue={blur}
      />
      <KeyValueRow
        label="Block:"
        labelWidth="w-16"
        display={blockNumber?.toString()}
        displayWidth="w-60 sm:w-64"
        blurValue={blur}
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
  );
}

function DeliveryStatus({ children }: PropsWithChildren<unknown>) {
  return (
    <div className="py-5 flex flex-col items-center text-gray-500 text-center">
      <div className="max-w-xs">{children}</div>
    </div>
  );
}

const helpText = {
  origin: 'Info about the transaction that initiated the message placement into the outbox.',
  destination:
    'Info about the transaction that triggered the delivery of the message from an inbox.',
};
