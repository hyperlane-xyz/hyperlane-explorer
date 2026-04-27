import { SpinnerIcon, Tooltip } from '@hyperlane-xyz/widgets';
import { ReactNode, useEffect, useState } from 'react';

import { Card } from '../../components/layout/Card';
import { logger } from '../../utils/logger';
import { OriginTransactionCard } from '../messages/cards/OriginTransactionCard';
import { useTransactionMessageCount } from '../messages/queries/useMessageQuery';
import { MessageSummaryRow } from './MessageSummaryRow';
import { useTransactionMessagesQuery } from './useTransactionMessagesQuery';

interface Props {
  txHash: string;
}

export function TransactionDetails({ txHash }: Props) {
  const [allExpanded, setAllExpanded] = useState(false);

  const { isFetching, isError, error, hasRun, isMessagesFound, messageList, originInfo, refetch } =
    useTransactionMessagesQuery(txHash);
  const txMessageCount = useTransactionMessageCount(txHash);
  const isMessageListTruncated = txMessageCount > messageList.length;

  useEffect(() => {
    if (!error) return;
    logger.error('Error loading transaction messages', error);
  }, [error]);

  // Loading state
  if (isFetching && !hasRun) {
    return (
      <TransactionStateCard>
        <SpinnerIcon width={40} height={40} />
        <p className="text-gray-500">Loading transaction messages...</p>
      </TransactionStateCard>
    );
  }

  // Error state
  if (isError) {
    return (
      <TransactionStateCard>
        <p className="text-red-500">Error loading transaction</p>
        <p className="max-w-md text-sm text-gray-500">
          {error?.message || 'Please check the transaction hash and try again.'}
        </p>
        <button
          type="button"
          onClick={refetch}
          className="text-sm font-medium text-blue-500 transition-colors hover:text-blue-600"
        >
          Retry
        </button>
      </TransactionStateCard>
    );
  }

  // Not found state
  if (hasRun && !isMessagesFound) {
    return (
      <TransactionStateCard>
        <p className="text-gray-700">No messages found</p>
        <p className="max-w-md text-sm text-gray-500">
          No Hyperlane messages were found for this transaction hash. The transaction may not have
          dispatched any messages, or it may not be indexed yet.
        </p>
      </TransactionStateCard>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      {/* Origin Transaction Card - reuse existing component */}
      {originInfo && (
        <OriginTransactionCard
          chainName={originInfo.chainName}
          domainId={originInfo.domainId}
          transaction={originInfo.transaction}
          blur={false}
        />
      )}

      {/* Messages Section */}
      <Card className="mt-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-md font-medium text-blue-500">
              Messages ({isMessageListTruncated ? `${messageList.length} of ` : ''}
              {isMessageListTruncated ? txMessageCount : messageList.length})
            </h3>
            <Tooltip
              id="messages-info"
              content="All Hyperlane messages dispatched in this transaction."
            />
          </div>
          {messageList.length > 1 && (
            <button
              onClick={() => setAllExpanded((prev) => !prev)}
              className="text-sm text-gray-500 transition-colors hover:text-gray-700"
            >
              {allExpanded ? 'Collapse All' : 'Expand All'}
            </button>
          )}
        </div>

        {isMessageListTruncated && (
          <p className="text-xs text-gray-500">
            Showing first {messageList.length} of {txMessageCount} messages.
          </p>
        )}

        <div className="space-y-3">
          {messageList.map((message, index) => (
            <MessageSummaryRow
              key={message.msgId}
              message={message}
              index={index}
              forceExpanded={allExpanded}
            />
          ))}
        </div>

        {isFetching && (
          <div className="flex items-center justify-center gap-2 py-2 text-sm text-gray-500">
            <SpinnerIcon width={16} height={16} />
            <span>Refreshing...</span>
          </div>
        )}
      </Card>
    </div>
  );
}

function TransactionStateCard({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-2xl">
      <Card className="flex min-h-[20rem] items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-center">{children}</div>
      </Card>
    </div>
  );
}
