import { Tooltip } from '@hyperlane-xyz/widgets';
import BigNumber from 'bignumber.js';
import { ChainLogo } from '../../../components/icons/ChainLogo';
import { SectionCard } from '../../../components/layout/SectionCard';
import { useChainMetadataResolver } from '../../../metadataStore';
import { MessageTx, MessageTxStub } from '../../../types';
import { formatTxHash } from '../../../utils/addresses';
import { getDateTimeString, getHumanReadableTimeString } from '../../../utils/time';
import { getBlockExplorerAddressUrl, getBlockExplorerTxUrl } from '../../../utils/url';
import { getChainDisplayName } from '../../chains/utils';
import { KeyValueRow } from './KeyValueRow';

export function OriginTransactionCard({
  chainName,
  domainId,
  transaction,
  blur,
}: {
  chainName: string;
  domainId: DomainId;
  transaction: MessageTx | MessageTxStub;
  blur: boolean;
}) {
  const chainMetadataResolver = useChainMetadataResolver();
  const { hash, from, timestamp } = transaction;
  const blockNumber = 'blockNumber' in transaction ? transaction.blockNumber : undefined;

  const formattedHash = formatTxHash(hash, domainId, chainMetadataResolver);
  const txExplorerLink =
    hash && !new BigNumber(hash).isZero()
      ? getBlockExplorerTxUrl(chainMetadataResolver, chainName, formattedHash)
      : null;
  const fromExplorerLink = getBlockExplorerAddressUrl(chainMetadataResolver, chainName, from);

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
      title="Origin Transaction"
      leading={<ChainLogo chainName={chainName} size={24} />}
      icon={<Tooltip id="transaction-info" content={helpText} />}
    >
      <div className="space-y-2">
        <KeyValueRow label="Chain:" labelWidth="w-16" display={chainDescription} blurValue={blur} />
        <KeyValueRow
          label="Tx:"
          labelWidth="w-16"
          display={formattedHash}
          showCopy={true}
          blurValue={blur}
          link={txExplorerLink}
          truncateMiddle={true}
        />
        <KeyValueRow
          label="From:"
          labelWidth="w-16"
          display={from}
          showCopy={true}
          blurValue={blur}
          link={fromExplorerLink}
          truncateMiddle={true}
        />
        {!!timestamp && (
          <KeyValueRow
            label="Time:"
            labelWidth="w-16"
            display={getHumanReadableTimeString(timestamp)}
            subDisplay={`(${getDateTimeString(timestamp)})`}
            blurValue={blur}
          />
        )}
        <KeyValueRow
          label="Block:"
          labelWidth="w-16"
          display={blockNumber?.toString() || ''}
          blurValue={blur}
        />
      </div>
    </SectionCard>
  );
}

const helpText = 'Info about the transaction that initiated the message placement into the outbox.';
