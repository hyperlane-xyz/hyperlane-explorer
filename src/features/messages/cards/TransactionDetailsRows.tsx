import BigNumber from 'bignumber.js';

import { MessageTx, MessageTxStub } from '../../../types';
import { formatTxHash } from '../../../utils/addresses';
import { getDateTimeString, getHumanReadableTimeString } from '../../../utils/time';
import { getBlockExplorerAddressUrl, getBlockExplorerTxUrl } from '../../../utils/url';
import type { ChainMetadataResolver } from '../../chains/metadataManager';
import { getChainDisplayName } from '../../chains/utils';
import { KeyValueRow } from './KeyValueRow';

type TransactionResolver = Pick<ChainMetadataResolver, 'tryGetChainMetadata' | 'tryGetChainName'>;

export function TransactionDetailsRows({
  chainName,
  domainId,
  transaction,
  blur,
  resolver,
}: {
  chainName: string;
  domainId: DomainId;
  transaction: MessageTx | MessageTxStub;
  blur: boolean;
  resolver: TransactionResolver;
}) {
  const { hash, from, timestamp } = transaction;
  const blockNumber = 'blockNumber' in transaction ? transaction.blockNumber : undefined;

  const formattedHash = formatTxHash(hash, domainId, resolver);
  const txExplorerLink =
    hash && !new BigNumber(hash).isZero()
      ? getBlockExplorerTxUrl(resolver, chainName, formattedHash)
      : null;
  const fromExplorerLink = getBlockExplorerAddressUrl(resolver, chainName, from);
  const idString =
    chainName && chainName !== resolver.tryGetChainName(domainId)
      ? `${chainName} / ${domainId}`
      : `${domainId}`;
  const chainDescription = `${getChainDisplayName(resolver, chainName, false, false)} (${idString})`;

  return (
    <>
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
    </>
  );
}
