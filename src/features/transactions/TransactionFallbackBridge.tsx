import { useEffect, useMemo } from 'react';

import { useMultiProviderInitFailed, useReadyMultiProvider } from '../../store';
import { PiQueryType } from '../messages/pi-queries/fetchPiChainMessages';
import { usePiChainMessageSearchQuery } from '../messages/pi-queries/usePiChainMessageQuery';
import { TransactionFallbackState } from './transactionFallbackState';

// Reads tx receipts over RPC on all EVM chains for txs the scraper hasn't indexed
export function TransactionFallbackBridge({
  txHash,
  onStateChange,
}: {
  txHash: string;
  onStateChange: (state: TransactionFallbackState) => void;
}) {
  const multiProvider = useReadyMultiProvider();
  const isMultiProviderInitFailed = useMultiProviderInitFailed();
  const { hasRun, isError, isFetching, messageList } = usePiChainMessageSearchQuery({
    sanitizedInput: txHash,
    piQueryType: PiQueryType.TxHash,
    includeScrapedChains: true,
    pause: false,
  });
  // The query resolves empty until the provider is ready, so don't report that as a result
  const isProviderPending = !multiProvider && !isMultiProviderInitFailed;

  const sortedMessageList = useMemo(
    () => [...messageList].sort((a, b) => a.nonce - b.nonce),
    [messageList],
  );

  useEffect(() => {
    onStateChange({
      hasRun: isError || isMultiProviderInitFailed || (hasRun && !isProviderPending),
      isFetching: isFetching || isProviderPending,
      messageList: sortedMessageList,
    });
  }, [
    hasRun,
    isError,
    isFetching,
    isMultiProviderInitFailed,
    isProviderPending,
    onStateChange,
    sortedMessageList,
  ]);

  return null;
}
