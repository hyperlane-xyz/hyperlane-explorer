import type { ChainMetadataResolver } from '@hyperlane-xyz/sdk/metadata/ChainMetadataResolver';
import { isZeroish } from '@hyperlane-xyz/utils';

import { MessageTx, MessageTxStub } from '../../../types';
import { formatTxHash } from '../../../utils/addresses';
import { getDateTimeString, getHumanReadableTimeString } from '../../../utils/time';
import { getBlockExplorerAddressUrl, getBlockExplorerTxUrl } from '../../../utils/url';
import { getChainDisplayName } from '../../chains/utils';
import type { ConfirmationProgress } from '../useConfirmationProgress';
import { KeyValueRow } from './KeyValueRow';

type TransactionResolver = Pick<ChainMetadataResolver, 'tryGetChainMetadata' | 'tryGetChainName'>;

export function TransactionDetailsRows({
  chainName,
  domainId,
  transaction,
  blur,
  resolver,
  confirmationProgress,
}: {
  chainName: string;
  domainId: DomainId;
  transaction: MessageTx | MessageTxStub;
  blur: boolean;
  resolver: TransactionResolver;
  confirmationProgress?: ConfirmationProgress | null;
}) {
  const { hash, from, timestamp } = transaction;
  const blockNumber = 'blockNumber' in transaction ? transaction.blockNumber : undefined;
  const showConfirmations = confirmationProgress && confirmationProgress.required > 0;
  const labelWidth = 'w-28';

  const formattedHash = formatTxHash(hash, domainId, resolver);
  const txExplorerLink =
    hash && !isZeroish(hash) ? getBlockExplorerTxUrl(resolver, chainName, formattedHash) : null;
  const fromExplorerLink = from ? getBlockExplorerAddressUrl(resolver, chainName, from) : null;
  const idString =
    chainName && chainName !== resolver.tryGetChainName(domainId)
      ? `${chainName} / ${domainId}`
      : `${domainId}`;
  const chainDescription = `${getChainDisplayName(resolver, chainName, false, false)} (${idString})`;

  return (
    <>
      <KeyValueRow
        label="Chain:"
        labelWidth={labelWidth}
        display={chainDescription}
        blurValue={blur}
      />
      <KeyValueRow
        label="Tx:"
        labelWidth={labelWidth}
        display={formattedHash}
        showCopy={true}
        blurValue={blur}
        link={txExplorerLink}
        truncateMiddle={true}
      />
      {from && (
        <KeyValueRow
          label="From:"
          labelWidth={labelWidth}
          display={from}
          showCopy={true}
          blurValue={blur}
          link={fromExplorerLink}
          truncateMiddle={true}
        />
      )}
      {!!timestamp && (
        <KeyValueRow
          label="Time:"
          labelWidth={labelWidth}
          display={getHumanReadableTimeString(timestamp)}
          subDisplay={`(${getDateTimeString(timestamp)})`}
          blurValue={blur}
        />
      )}
      {blockNumber !== undefined && (
        <KeyValueRow
          label="Block:"
          labelWidth={labelWidth}
          display={blockNumber.toString()}
          blurValue={blur}
        />
      )}
      {showConfirmations && (
        <KeyValueRow
          label="Confirmations:"
          labelWidth={labelWidth}
          display={
            confirmationProgress.current === null
              ? 'Waiting for block data'
              : `${confirmationProgress.current} / ${confirmationProgress.required}`
          }
          subDisplay={
            confirmationProgress.current === null ||
            confirmationProgress.current < confirmationProgress.required
              ? 'Confirming'
              : 'Confirmed'
          }
          tooltip="Observed origin-chain head minus the dispatch block. No time-based estimates."
          blurValue={blur}
        />
      )}
    </>
  );
}
