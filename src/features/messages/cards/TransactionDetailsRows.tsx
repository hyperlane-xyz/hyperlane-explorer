import type { ChainMetadataResolver } from '@hyperlane-xyz/sdk/metadata/ChainMetadataResolver';
import { isZeroish } from '@hyperlane-xyz/utils';
import { BoxArrowIcon, CopyButton } from '@hyperlane-xyz/widgets';

import { MessageTx, MessageTxStub } from '../../../types';
import { formatTxHash } from '../../../utils/addresses';
import { getDateTimeString } from '../../../utils/time';
import { getBlockExplorerAddressUrl, getBlockExplorerTxUrl } from '../../../utils/url';

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
  const hasHash = !!hash && !isZeroish(hash);
  const txExplorerLink = hasHash ? getBlockExplorerTxUrl(resolver, chainName, formattedHash) : null;
  const fromExplorerLink = from ? getBlockExplorerAddressUrl(resolver, chainName, from) : null;

  return (
    <dl className={`min-w-0 space-y-3 ${blur ? 'blur-xs' : ''}`}>
      <div>
        <dt className="mb-1 text-xxs text-gray-500">Transaction hash</dt>
        <dd>
          <TransactionValue
            value={hasHash ? formattedHash : ''}
            href={txExplorerLink}
            label="transaction hash"
          />
        </dd>
      </div>
      {from && (
        <div>
          <dt className="mb-1 text-xxs text-gray-500">Submitted by</dt>
          <dd>
            <TransactionValue value={from} href={fromExplorerLink} label="transaction sender" />
          </dd>
        </div>
      )}
      {(!!timestamp || blockNumber !== undefined) && (
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2 border-t border-gray-200/70 pt-3 text-xs">
          {!!timestamp && (
            <div className="min-w-0">
              <dt className="text-xxs text-gray-500">Time (local)</dt>
              <dd className="mt-1 text-gray-700">
                <time
                  dateTime={new Date(timestamp).toISOString()}
                  title={new Date(timestamp).toISOString()}
                >
                  {getDateTimeString(timestamp)}
                </time>
              </dd>
            </div>
          )}
          {blockNumber !== undefined && (
            <div>
              <dt className="text-xxs text-gray-500">Block</dt>
              <dd className="mt-1 break-all tabular-nums text-gray-700">
                {blockNumber.toLocaleString()}
              </dd>
            </div>
          )}
        </div>
      )}
    </dl>
  );
}

function TransactionValue({
  value,
  href,
  label,
}: {
  value: string;
  href: string | null;
  label: string;
}) {
  if (!value) return <span className="text-xs text-gray-500">Not available</span>;
  return (
    <div className="flex min-w-0 items-start gap-2">
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`View ${label} on block explorer`}
          className="min-w-0 break-all font-mono text-xs leading-5 text-primary-700 underline decoration-primary-200 underline-offset-4 hover:text-primary-900"
        >
          {value}
          <BoxArrowIcon width={11} height={11} className="ml-1 inline-block align-middle" />
        </a>
      ) : (
        <code className="min-w-0 break-all text-xs leading-5 text-gray-800">{value}</code>
      )}
      <CopyButton
        copyValue={value}
        aria-label={`Copy ${label}`}
        width={12}
        height={12}
        className="mt-1 shrink-0 text-gray-500 [&_rect]:stroke-current [&_path]:fill-current"
      />
    </div>
  );
}
