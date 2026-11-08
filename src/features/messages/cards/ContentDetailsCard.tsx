import { formatMessage } from '@hyperlane-xyz/utils';
import { BoxArrowIcon, CopyButton } from '@hyperlane-xyz/widgets';
import clsx from 'clsx';
import dynamic from 'next/dynamic';
import { useId, useMemo, useState, type ReactNode } from 'react';

import { ChainLogo } from '../../../components/icons/ChainLogo';
import { MessageIcon } from '../../../components/icons/MessageIcon';
import { isAeroVoterMessage } from '../../../consts/aeroVoterRoutes';
import { MAILBOX_VERSION } from '../../../consts/mailbox';
import { useChainMetadataResolver } from '../../../metadataStore';
import type { Message, MessageStub, WarpRouteDetails } from '../../../types';
import { formatAddress } from '../../../utils/addresses';
import { logger } from '../../../utils/logger';
import { getBlockExplorerAddressUrl } from '../../../utils/url';
import { getChainDisplayName } from '../../chains/utils';
import { MessagePayload } from './MessagePayload';

const WarpTransferDetails = dynamic(
  () => import('./WarpTransferDetailsCard').then((module) => module.WarpTransferDetails),
  { loading: () => <p className="py-3 text-sm text-gray-500">Loading Warp details…</p> },
);

interface Props {
  message: Message | MessageStub;
  blur: boolean;
  warpRouteDetails?: WarpRouteDetails;
  details?: ReactNode;
}

export function ContentDetailsCard({ message, blur, warpRouteDetails, details }: Props) {
  return (
    <ContentDetails
      key={message.msgId}
      message={message}
      blur={blur}
      warpRouteDetails={warpRouteDetails}
      details={details}
    />
  );
}

function ContentDetails({ message, blur, warpRouteDetails, details }: Props) {
  const { msgId, nonce, originDomainId, destinationDomainId, sender, recipient, body } = message;
  const [isRaw, setRaw] = useState(false);
  const contentId = useId();
  const rawBytes = useMemo(() => {
    try {
      if (originDomainId < 0 || destinationDomainId < 0) return '';
      return formatMessage(
        MAILBOX_VERSION,
        nonce,
        originDomainId,
        sender,
        destinationDomainId,
        recipient,
        body,
      );
    } catch (error) {
      logger.warn('Error formatting message', error);
      return '';
    }
  }, [nonce, originDomainId, sender, destinationDomainId, recipient, body]);

  return (
    <section
      aria-label="Message details"
      className="shadow-card min-w-0 overflow-hidden rounded-xl border border-gray-200 bg-white"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-gray-150 px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2">
          <MessageIcon width={18} height={18} className="text-primary-700" aria-hidden="true" />
          <h2 className="text-sm font-medium text-gray-800">Message details</h2>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3">
          <fieldset className="flex rounded-md bg-gray-200/70 p-0.5">
            <legend className="sr-only">Message representation</legend>
            {(['Details', 'Raw'] as const).map((label) => (
              <button
                key={label}
                type="button"
                aria-pressed={isRaw === (label === 'Raw')}
                aria-controls={contentId}
                onClick={() => setRaw(label === 'Raw')}
                className={clsx(
                  'rounded px-2 py-1 text-xs transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500',
                  isRaw === (label === 'Raw')
                    ? 'bg-white text-primary-800 shadow-sm'
                    : 'text-gray-500 hover:text-gray-800',
                )}
              >
                {label}
              </button>
            ))}
          </fieldset>
          <CopyButton
            copyValue={rawBytes}
            aria-label="Copy raw message"
            title={rawBytes ? 'Copy raw message' : 'Raw message bytes unavailable'}
            disabled={!rawBytes}
            width={13}
            height={13}
            className="rounded p-2 text-gray-500 hover:text-gray-800 disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500 [&_rect]:stroke-current [&_path]:fill-current"
          />
        </div>
      </header>
      <div id={contentId} className={clsx('p-4 sm:p-5', blur && 'blur-xs')}>
        <div hidden={isRaw} className="space-y-4">
          <dl className="flex min-w-0 flex-wrap items-baseline gap-x-6 gap-y-3 border-b border-gray-200 pb-3">
            <div className="flex min-w-0 flex-1 basis-64 flex-wrap items-baseline gap-x-4 gap-y-1.5">
              <dt
                className="shrink-0 text-xs text-gray-500"
                title="Hash of the complete encoded message"
              >
                Message ID
              </dt>
              <dd className="min-w-0">
                <CopyableValue label="message ID" value={msgId} />
              </dd>
            </div>
            <div className="flex shrink-0 items-center gap-2 text-xs">
              <dt className="text-gray-500">Nonce</dt>
              <dd className="flex items-center gap-2">
                <span className="font-mono tabular-nums text-gray-800">{nonce}</span>
                <CopyButton
                  copyValue={String(nonce)}
                  aria-label="Copy nonce"
                  width={12}
                  height={12}
                  className="text-gray-500 [&_rect]:stroke-current [&_path]:fill-current"
                />
              </dd>
            </div>
          </dl>
          <div className="grid min-w-0 gap-4 sm:grid-cols-2 sm:gap-6">
            <EnvelopeEndpoint
              label="Origin"
              addressLabel="Sender"
              domainId={originDomainId}
              address={sender}
            />
            <EnvelopeEndpoint
              label="Destination"
              addressLabel="Recipient"
              domainId={destinationDomainId}
              address={recipient}
            />
          </div>
          <MessagePayload
            message={message}
            title={
              warpRouteDetails
                ? 'Warp message'
                : isAeroVoterMessage(message)
                  ? 'Aero V3 message'
                  : 'Payload'
            }
            details={
              warpRouteDetails ? (
                <WarpTransferDetails
                  message={message}
                  warpRouteDetails={warpRouteDetails}
                  blur={blur}
                />
              ) : (
                details
              )
            }
          />
        </div>
        {isRaw &&
          (rawBytes ? (
            <pre
              aria-label="Raw message bytes"
              className="max-h-80 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-gray-50 p-3 font-mono text-xs leading-5 text-gray-700"
            >
              <code>{rawBytes}</code>
            </pre>
          ) : (
            <p className="text-sm text-gray-500">Raw message bytes unavailable.</p>
          ))}
      </div>
    </section>
  );
}

function EnvelopeEndpoint({
  label,
  addressLabel,
  domainId,
  address,
}: {
  label: string;
  addressLabel: string;
  domainId: number;
  address: string;
}) {
  const metadata = useChainMetadataResolver();
  const chainName = metadata.tryGetChainName(domainId) ?? undefined;
  const displayName = chainName ? getChainDisplayName(metadata, chainName) : `Domain ${domainId}`;
  const nativeAddress = formatAddress(address, domainId, metadata);
  const link = getBlockExplorerAddressUrl(metadata, domainId, nativeAddress);

  return (
    <div className="min-w-0">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-gray-50">
          <ChainLogo chainName={chainName} size={22} />
        </span>
        <div className="min-w-0">
          <h3 className="text-xs leading-5 text-gray-500">
            {label}
            {chainName && <span title="Hyperlane domain ID"> · Domain {domainId}</span>}
          </h3>
          <p className="text-sm font-medium leading-5 text-gray-800">{displayName}</p>
        </div>
      </div>
      <dl className="mt-2">
        <dt className="mb-0.5 text-xxs text-gray-500">{addressLabel}</dt>
        <dd>
          <CopyableValue
            label={`${addressLabel.toLowerCase()} address`}
            value={nativeAddress}
            href={link}
            linkLabel={`${addressLabel} application on ${displayName}`}
          />
        </dd>
      </dl>
    </div>
  );
}

function CopyableValue({
  label,
  value,
  href,
  linkLabel,
}: {
  label: string;
  value: string;
  href?: string | null;
  linkLabel?: string;
}) {
  return (
    <div className="flex min-w-0 items-start gap-2">
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={linkLabel}
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
