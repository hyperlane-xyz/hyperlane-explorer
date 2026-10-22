import { SpinnerIcon, Tooltip } from '@hyperlane-xyz/widgets';
import dynamic from 'next/dynamic';
import { ReactNode, useCallback, useEffect, useState } from 'react';

import { Card } from '../../components/layout/Card';
import { useChainMetadataResolver, useStore } from '../../metadataStore';
import { Message } from '../../types';
import { logger } from '../../utils/logger';
import { OriginTransactionCard } from '../messages/cards/OriginTransactionCard';
import { MessageSummaryRow } from './MessageSummaryRow';
import {
  DEFAULT_TRANSACTION_FALLBACK_STATE,
  TransactionFallbackState,
} from './transactionFallbackState';
import { useTransactionMessageCount } from './useTransactionMessageCount';
import { useTransactionMessagesQuery } from './useTransactionMessagesQuery';

// Loaded on demand to keep ethers and core contracts out of the main chunk
const TransactionFallbackBridge = dynamic(() =>
  import('./TransactionFallbackBridge').then((mod) => mod.TransactionFallbackBridge),
);

interface Props {
  txHash: string;
}

export function TransactionDetails({ txHash }: Props) {
  const ensureWarpRouteData = useStore((s) => s.ensureWarpRouteData);
  const isWarpRouteDataLoaded = useStore((s) => s.isWarpRouteDataLoaded);
  const [fallbackState, setFallbackState] = useState<{
    txHash: string;
    value: TransactionFallbackState;
  }>({ txHash, value: DEFAULT_TRANSACTION_FALLBACK_STATE });

  const {
    isFetching: isDbFetching,
    isError,
    error,
    hasRun: hasDbRun,
    isMessagesFound: isDbMessagesFound,
    messageList: dbMessageList,
    refetch,
  } = useTransactionMessagesQuery(txHash);
  const txMessageCount = useTransactionMessageCount(txHash);

  // Fall back to RPC when the scraper has no messages for this tx (lag, outage, or unscraped
  // origin). DB results win once indexed since the DB query keeps polling.
  const shouldRunFallback = hasDbRun && !isDbMessagesFound;
  const activeFallbackState =
    shouldRunFallback && fallbackState.txHash === txHash
      ? fallbackState.value
      : DEFAULT_TRANSACTION_FALLBACK_STATE;

  const handleFallbackStateChange = useCallback(
    (value: TransactionFallbackState) => setFallbackState({ txHash, value }),
    [txHash],
  );

  useEffect(() => {
    if (!error) return;
    logger.error('Error loading transaction messages', error);
  }, [error]);

  // Message rows need the warp route map to classify warp transfers.
  useEffect(() => {
    if (isWarpRouteDataLoaded) return;
    ensureWarpRouteData().catch((e) => logger.error('Error loading warp route data', e));
  }, [ensureWarpRouteData, isWarpRouteDataLoaded]);

  return (
    <>
      {shouldRunFallback && (
        <TransactionFallbackBridge
          key={txHash}
          txHash={txHash}
          onStateChange={handleFallbackStateChange}
        />
      )}
      <TransactionMessages
        isFetching={isDbFetching || activeFallbackState.isFetching}
        hasRun={hasDbRun && (!shouldRunFallback || activeFallbackState.hasRun)}
        error={error}
        isError={isError}
        messageList={isDbMessagesFound ? dbMessageList : activeFallbackState.messageList}
        txMessageCount={txMessageCount}
        refetch={refetch}
      />
    </>
  );
}

function TransactionMessages({
  isFetching,
  hasRun,
  error,
  isError,
  messageList,
  txMessageCount,
  refetch,
}: {
  isFetching: boolean;
  hasRun: boolean;
  error?: Error;
  isError: boolean;
  messageList: Message[];
  txMessageCount: number;
  refetch: () => void;
}) {
  const [allExpanded, setAllExpanded] = useState(false);
  const chainMetadataResolver = useChainMetadataResolver();
  const isMessageListTruncated = txMessageCount > messageList.length;
  const originMessage = messageList[0];

  // Loading state
  if (!hasRun) {
    return (
      <TransactionStateCard>
        <SpinnerIcon width={40} height={40} />
        <p className="text-gray-500">Loading transaction messages...</p>
      </TransactionStateCard>
    );
  }

  // Error state, unless the RPC fallback found messages
  if (isError && !originMessage) {
    return (
      <TransactionStateCard>
        <p className="text-red-500">Error loading transaction</p>
        <p className="max-w-md text-sm text-gray-500">
          {error?.message || 'Please check the transaction hash and try again.'}
        </p>
        <button
          type="button"
          onClick={refetch}
          className="text-primary-600 hover:text-primary-500 text-sm font-medium transition-colors"
        >
          Retry
        </button>
      </TransactionStateCard>
    );
  }

  // Not found state
  if (!originMessage) {
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
      <OriginTransactionCard
        chainName={chainMetadataResolver.tryGetChainName(originMessage.originDomainId) || 'Unknown'}
        domainId={originMessage.originDomainId}
        transaction={originMessage.origin}
        blur={false}
      />

      {/* Messages Section */}
      <Card className="mt-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-md font-medium text-gray-700">
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
