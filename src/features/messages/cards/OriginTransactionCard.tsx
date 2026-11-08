import { toTitleCase } from '@hyperlane-xyz/utils';
import type { ReactNode } from 'react';

import { useChainMetadataResolver } from '../../../metadataStore';
import { MessageStatus, MessageTx, MessageTxStub } from '../../../types';
import { TransactionDetailsRows } from './TransactionDetailsRows';
import { TransactionRecordCard, transactionHelpText } from './TransactionRecordCard';

export function OriginTransactionCard({
  chainName,
  domainId,
  transaction,
  blur,
  children,
}: {
  children?: ReactNode;
  chainName: string;
  domainId: DomainId;
  transaction: MessageTx | MessageTxStub;
  blur: boolean;
}) {
  return (
    <MessageTransactionPreviewCard
      chainName={chainName}
      domainId={domainId}
      transaction={transaction}
      blur={blur}
      title="Origin transaction"
      helpText={transactionHelpText.origin}
    >
      {children}
    </MessageTransactionPreviewCard>
  );
}

export function DestinationTransactionPreviewCard({
  chainName,
  domainId,
  status,
  transaction,
  blur,
  isLiveDetailsPending,
  isOriginConfirming = false,
}: {
  chainName: string;
  domainId: DomainId;
  status: MessageStatus;
  transaction?: MessageTx | MessageTxStub;
  blur: boolean;
  isLiveDetailsPending: boolean;
  isOriginConfirming?: boolean;
}) {
  if (transaction) {
    return (
      <MessageTransactionPreviewCard
        chainName={chainName}
        domainId={domainId}
        transaction={transaction}
        blur={blur}
        title="Delivery transaction"
        helpText={transactionHelpText.destination}
      />
    );
  }

  return (
    <TransactionRecordCard
      chainName={chainName}
      domainId={domainId}
      title="Delivery transaction"
      helpText={transactionHelpText.destination}
    >
      <div className="space-y-2">
        <p className={`text-sm text-gray-700 ${blur ? 'blur-xs' : ''}`}>
          {isOriginConfirming ? 'Waiting for origin confirmations' : toTitleCase(status)}
        </p>
        <div className="pt-2 text-sm font-light text-gray-500">
          {isLiveDetailsPending
            ? 'Loading live delivery details...'
            : 'Waiting for live delivery details.'}
        </div>
      </div>
    </TransactionRecordCard>
  );
}

function MessageTransactionPreviewCard({
  chainName,
  domainId,
  transaction,
  blur,
  title,
  helpText,
  children,
}: {
  children?: ReactNode;
  chainName: string;
  domainId: DomainId;
  transaction: MessageTx | MessageTxStub;
  blur: boolean;
  title: string;
  helpText: string;
}) {
  const chainMetadataResolver = useChainMetadataResolver();

  return (
    <TransactionRecordCard
      chainName={chainName}
      domainId={domainId}
      title={title}
      helpText={helpText}
    >
      <div className="space-y-2">
        <TransactionDetailsRows
          chainName={chainName}
          domainId={domainId}
          transaction={transaction}
          blur={blur}
          resolver={chainMetadataResolver}
        />
      </div>
      {children}
    </TransactionRecordCard>
  );
}
