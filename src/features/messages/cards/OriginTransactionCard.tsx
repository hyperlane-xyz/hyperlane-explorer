import { toTitleCase } from '@hyperlane-xyz/utils';
import { Tooltip } from '@hyperlane-xyz/widgets';
import { useId } from 'react';

import { ChainLogo } from '../../../components/icons/ChainLogo';
import { SectionCard } from '../../../components/layout/SectionCard';
import { useChainMetadataResolver } from '../../../metadataStore';
import { MessageStatus, MessageTx, MessageTxStub } from '../../../types';
import { getChainDisplayName } from '../../chains/utils';
import type { ConfirmationProgress } from '../useConfirmationProgress';
import { KeyValueRow } from './KeyValueRow';
import { transactionHelpText } from './TransactionCard';
import { TransactionDetailsRows } from './TransactionDetailsRows';

export function OriginTransactionCard({
  chainName,
  domainId,
  transaction,
  blur,
  confirmationProgress,
}: {
  chainName: string;
  domainId: DomainId;
  transaction: MessageTx | MessageTxStub;
  blur: boolean;
  confirmationProgress?: ConfirmationProgress | null;
}) {
  return (
    <MessageTransactionPreviewCard
      chainName={chainName}
      domainId={domainId}
      transaction={transaction}
      confirmationProgress={confirmationProgress}
      blur={blur}
      title="Origin Transaction"
      helpText={transactionHelpText.origin}
    />
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
  const chainMetadataResolver = useChainMetadataResolver();
  const tooltipId = `${useId()}-destination-transaction-info`;

  if (transaction) {
    return (
      <MessageTransactionPreviewCard
        chainName={chainName}
        domainId={domainId}
        transaction={transaction}
        blur={blur}
        title="Destination Transaction"
        helpText={transactionHelpText.destination}
      />
    );
  }

  const idString =
    chainName && chainName !== chainMetadataResolver.tryGetChainName(domainId)
      ? `${chainName} / ${domainId}`
      : `${domainId}`;
  const chainDescription = `${getChainDisplayName(
    chainMetadataResolver,
    chainName,
    false,
    false,
  )} (${idString})`;

  return (
    <SectionCard
      className="flex min-w-[340px] flex-1 basis-0 flex-col"
      title="Destination Transaction"
      leading={<ChainLogo chainName={chainName} size={24} />}
      icon={<Tooltip id={tooltipId} content={transactionHelpText.destination} />}
    >
      <div className="space-y-2">
        <KeyValueRow label="Chain:" labelWidth="w-28" display={chainDescription} blurValue={blur} />
        <KeyValueRow
          label="Status:"
          labelWidth="w-28"
          display={isOriginConfirming ? 'Waiting for origin confirmations' : toTitleCase(status)}
          blurValue={blur}
        />
        <div className="pt-2 text-sm font-light text-gray-500">
          {isLiveDetailsPending
            ? 'Loading live delivery details...'
            : 'Waiting for live delivery details.'}
        </div>
      </div>
    </SectionCard>
  );
}

function MessageTransactionPreviewCard({
  chainName,
  domainId,
  transaction,
  blur,
  title,
  helpText,
  confirmationProgress,
}: {
  chainName: string;
  domainId: DomainId;
  transaction: MessageTx | MessageTxStub;
  blur: boolean;
  title: string;
  helpText: string;
  confirmationProgress?: ConfirmationProgress | null;
}) {
  const chainMetadataResolver = useChainMetadataResolver();
  const tooltipId = `${useId()}-transaction-info`;

  return (
    <SectionCard
      className="flex min-w-[340px] flex-1 basis-0 flex-col"
      title={title}
      leading={<ChainLogo chainName={chainName} size={24} />}
      icon={<Tooltip id={tooltipId} content={helpText} />}
    >
      <div className="space-y-2">
        <TransactionDetailsRows
          chainName={chainName}
          domainId={domainId}
          transaction={transaction}
          blur={blur}
          resolver={chainMetadataResolver}
          confirmationProgress={confirmationProgress}
        />
      </div>
    </SectionCard>
  );
}
