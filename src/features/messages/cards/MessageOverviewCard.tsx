import type { TokenArgs } from '@hyperlane-xyz/sdk';
import { isZeroish } from '@hyperlane-xyz/utils';
import { BoxArrowIcon, CopyButton } from '@hyperlane-xyz/widgets';
import BigNumber from 'bignumber.js';
import clsx from 'clsx';
import Link from 'next/link';

import { ChainLogo } from '../../../components/icons/ChainLogo';
import { MessageIcon } from '../../../components/icons/MessageIcon';
import { SendIcon } from '../../../components/icons/SendIcon';
import { TokenIcon } from '../../../components/icons/TokenIcon';
import { useChainMetadataResolver } from '../../../metadataStore';
import {
  MessageStatus,
  type Message,
  type MessageStub,
  type WarpRouteDetails,
} from '../../../types';
import { formatAddress, formatTxHash } from '../../../utils/addresses';
import { truncateString } from '../../../utils/string';
import { getBlockExplorerTxUrl } from '../../../utils/url';
import { getChainDisplayName } from '../../chains/utils';
import { AddressInline } from './ismRender/AddressInline';

import styles from './MessageOverviewCard.module.css';

interface Props {
  message: Message | MessageStub;
  warpRouteDetails?: WarpRouteDetails;
  txMessageCount?: number;
  active?: boolean;
}

export function MessageOverviewCard({
  message,
  warpRouteDetails,
  txMessageCount = 0,
  active = false,
}: Props) {
  const delivered = message.status === MessageStatus.Delivered;
  return (
    <section aria-label="Message overview" className="min-w-0">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
        <div className="flex min-w-0 items-center gap-2">
          <MessageIcon width={14} height={14} color="currentColor" />
          <span>Message</span>
          <span className="font-mono" title={message.msgId}>
            {truncateString(message.msgId, 10, 8)}
          </span>
          <CopyButton copyValue={message.msgId} width={12} height={12} className="opacity-60" />
        </div>
        {message.origin.timestamp > 0 && (
          <time dateTime={new Date(message.origin.timestamp).toISOString()}>
            {new Date(message.origin.timestamp).toLocaleString()}
          </time>
        )}
      </div>
      <div className="grid min-w-0 items-stretch gap-2 sm:grid-cols-[minmax(0,1fr)_4rem_minmax(0,1fr)] sm:gap-3">
        <RouteSide
          label="Source"
          domainId={message.originDomainId}
          token={warpRouteDetails?.originToken}
          amount={warpRouteDetails?.amount}
          amountLabel="Transfer amount"
          address={warpRouteDetails ? message.origin.from : message.sender}
          addressLabel={warpRouteDetails ? 'Initiated by' : 'Sending application'}
        />
        <div
          className="relative flex h-10 items-center justify-center text-primary-600 sm:h-auto"
          aria-hidden="true"
        >
          <span className="absolute h-full w-0.5 bg-primary-300 sm:h-0.5 sm:w-full" />
          <span
            className={clsx(
              'relative flex h-9 w-9 items-center justify-center rounded-full border border-primary-300 bg-white',
              active && styles.sending,
            )}
          >
            <SendIcon width={18} height={18} className="rotate-90 sm:rotate-0" />
          </span>
        </div>
        <RouteSide
          label="Destination"
          domainId={message.destinationDomainId}
          token={warpRouteDetails?.destinationToken}
          amount={
            warpRouteDetails ? (warpRouteDetails.destAmount ?? warpRouteDetails.amount) : undefined
          }
          amountLabel={delivered ? 'Bridged amount' : 'Expected amount'}
          address={warpRouteDetails?.transferRecipient ?? message.recipient}
          addressLabel={warpRouteDetails ? 'Transfer recipient' : 'Receiving application'}
        />
      </div>

      <div className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2">
        <TransactionLink
          label="Source transaction"
          domainId={message.originDomainId}
          hash={message.origin.hash}
          emptyLabel="Transaction details unavailable"
        />
        <TransactionLink
          label="Delivery transaction"
          delivered={delivered}
          domainId={message.destinationDomainId}
          hash={delivered ? message.destination?.hash : undefined}
          emptyLabel={
            delivered ? 'Delivery recorded · transaction indexing' : 'Waiting for delivery'
          }
        />
      </div>
      {txMessageCount > 1 && message.origin.hash && !isZeroish(message.origin.hash) && (
        <Link
          href={`/tx/${message.origin.hash}`}
          className="mt-4 inline-block text-xs font-medium text-primary-700 underline decoration-primary-200 underline-offset-4 hover:text-primary-900"
        >
          View all {txMessageCount} messages in this transaction
        </Link>
      )}
    </section>
  );
}

function RouteSide({
  label,
  domainId,
  token,
  amount,
  amountLabel,
  address,
  addressLabel,
}: {
  label: string;
  domainId: number;
  token?: TokenArgs;
  amount?: string;
  amountLabel: string;
  address?: string;
  addressLabel: string;
}) {
  const resolver = useChainMetadataResolver();
  const chainName = resolver.tryGetChainName(domainId) ?? undefined;
  const displayName = chainName ? getChainDisplayName(resolver, chainName) : `Domain ${domainId}`;
  // Warp recipients and transaction initiators are already native account addresses.
  const nativeAddress = address && !token ? formatAddress(address, domainId, resolver) : address;

  return (
    <div className="min-w-0 rounded-lg bg-gray-150/60 p-3 sm:p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <div className="mt-2 flex min-w-0 items-center gap-2.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center">
          <ChainLogo chainName={chainName} size={28} />
        </span>
        <h2 className="min-w-0 break-words text-base font-medium text-gray-900">{displayName}</h2>
      </div>
      {token && amount !== undefined && (
        <div className="mt-3">
          <p className="text-xs text-gray-500">{amountLabel}</p>
          <div
            className="mt-1.5 flex min-w-0 items-center gap-2.5"
            title={`${amount} ${token.symbol ?? ''}`}
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full">
              <TokenIcon token={token} size={32} />
            </span>
            <p className="min-w-0 break-words text-lg font-medium text-primary-900">
              {new BigNumber(amount).toFormat()}{' '}
              <span className="text-base font-normal text-gray-600">{token.symbol}</span>
            </p>
          </div>
        </div>
      )}
      <div className="mt-3 min-w-0">
        <p className="mb-1 text-xs text-gray-500">{addressLabel}</p>
        {nativeAddress ? (
          <AddressInline address={nativeAddress} chainName={chainName ?? String(domainId)} />
        ) : (
          <span className="text-sm text-gray-500">Not reported</span>
        )}
      </div>
    </div>
  );
}

function TransactionLink({
  label,
  domainId,
  hash,
  emptyLabel,
  delivered = false,
}: {
  label: string;
  domainId: number;
  hash?: string;
  emptyLabel: string;
  delivered?: boolean;
}) {
  const resolver = useChainMetadataResolver();
  const formattedHash =
    hash && !isZeroish(hash) ? formatTxHash(hash, domainId, resolver) : undefined;
  const link = formattedHash ? getBlockExplorerTxUrl(resolver, domainId, formattedHash) : null;

  return (
    <div
      className={clsx(
        'min-w-0 rounded-lg border p-3',
        delivered ? 'border-green-200 bg-green-25/70' : 'border-gray-200 bg-white',
      )}
    >
      <p
        className={clsx(
          'mb-1.5 flex items-center gap-1.5 text-xs',
          delivered ? 'font-medium text-green-800' : 'text-gray-500',
        )}
      >
        {delivered && <span aria-hidden="true">✓</span>}
        {label}
        {delivered && <span className="ml-auto text-xxs font-normal">Successful delivery</span>}
      </p>
      {formattedHash ? (
        <div className="flex min-w-0 items-center gap-2">
          {link ? (
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${label} on block explorer`}
              title={formattedHash}
              className={clsx(
                'flex min-w-0 items-center gap-1.5 font-mono text-sm underline underline-offset-4',
                delivered
                  ? 'text-green-800 decoration-green-200 hover:text-green-900'
                  : 'text-primary-700 decoration-primary-200 hover:text-primary-900',
              )}
            >
              <span className="truncate">{truncateString(formattedHash, 12, 10)}</span>
              <BoxArrowIcon width={12} height={12} className="shrink-0" />
            </a>
          ) : (
            <span className="truncate font-mono text-sm text-gray-700" title={formattedHash}>
              {truncateString(formattedHash, 12, 10)}
            </span>
          )}
          <CopyButton
            copyValue={formattedHash}
            width={12}
            height={12}
            className="shrink-0 opacity-60"
          />
        </div>
      ) : (
        <p className="text-sm text-gray-500">{emptyLabel}</p>
      )}
    </div>
  );
}
