import { addressToBytes32, formatMessage, fromWei, strip0x } from '@hyperlane-xyz/utils';
import { CopyButton, Tooltip } from '@hyperlane-xyz/widgets';
import clsx from 'clsx';
import { BigNumber } from 'ethers';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { SectionCard } from '../../../components/layout/SectionCard';
import { MAILBOX_VERSION } from '../../../consts/mailbox';
import { useChainMetadataResolver } from '../../../metadataStore';
import { IcaCall, Message, MessageStatus, MessageStub } from '../../../types';
import { tryGetBlockExplorerAddressUrl } from '../../../utils/url';
import { MessageDebugResult } from '../../debugger/types';
import {
  decodeIcaBody,
  IcaMessageType,
  useCcipReadIsmUrls,
  useIcaAddress,
  useRelatedIcaMessage,
  useRevealCalls,
} from '../ica';
import { KeyValueRow } from './KeyValueRow';

/**
 * Check if a bytes32 salt contains an address (first 12 bytes are zeros, last 20 bytes are non-zero).
 * This is surfaced as User only for ICA user-salt mode, where the router encodes the EOA in bytes12(0) + address.
 * Returns the address if valid, or null otherwise.
 */
function extractAddressFromSalt(salt: string | undefined): string | null {
  if (!salt) return null;
  const saltHex = strip0x(salt);
  if (saltHex.length !== 64) return null;

  // Check if first 12 bytes (24 hex chars) are zeros
  const prefix = saltHex.slice(0, 24);
  if (prefix !== '0'.repeat(24)) return null;

  // Check if last 20 bytes (40 hex chars) are non-zero
  const addressHex = saltHex.slice(24);
  if (addressHex === '0'.repeat(40)) return null;

  return '0x' + addressHex;
}

interface Props {
  message: Message | MessageStub;
  blur: boolean;
  debugResult?: MessageDebugResult;
}

function getFormattedCallValue(value: string, nativeDecimals: number) {
  try {
    const hasValue = BigNumber.from(value).gt(0);
    return {
      hasValue,
      formattedValue: hasValue ? fromWei(value, nativeDecimals) : '0',
    };
  } catch {
    return { hasValue: false, formattedValue: '0' };
  }
}

type IcaStatusTone = 'done' | 'pending';

const ICA_STATUS_TONE_STYLES: Record<
  IcaStatusTone,
  {
    border: string;
    bg: string;
    status: string;
    title: string;
    body: string;
  }
> = {
  done: {
    border: 'border-green-200',
    bg: 'bg-green-100/40',
    status: 'text-green-600',
    title: 'text-green-800',
    body: 'text-green-800',
  },
  pending: {
    border: 'border-amber-200',
    bg: 'bg-amber-50',
    status: 'text-amber-600',
    title: 'text-amber-800',
    body: 'text-amber-800',
  },
};

function IcaStatusPanel({
  tone,
  statusLabel,
  title,
  titleAccessory,
  commitment,
  footer,
}: {
  tone: IcaStatusTone;
  statusLabel: string;
  title: string;
  titleAccessory?: ReactNode;
  commitment: string;
  footer?: ReactNode;
}) {
  const styles = ICA_STATUS_TONE_STYLES[tone];

  return (
    <div className={clsx('rounded border p-3', styles.border, styles.bg)}>
      <div className="flex items-start gap-2">
        <span className={clsx('text-xs font-medium', styles.status)}>{statusLabel}</span>
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className={clsx('text-sm font-medium', styles.title)}>{title}</span>
            {titleAccessory}
          </div>
          <div className="mt-2 flex items-start gap-2">
            <div className={clsx('min-w-0 flex-1 break-all font-mono text-xs', styles.body)}>
              {commitment}
            </div>
            <CopyButton
              copyValue={commitment}
              width={12}
              height={12}
              className="mt-0.5 shrink-0 opacity-60 hover:opacity-100"
            />
          </div>
          {footer}
        </div>
      </div>
    </div>
  );
}

export function IcaDetailsCard({ message, blur, debugResult }: Props) {
  const {
    body,
    msgId,
    nonce,
    sender,
    recipient,
    originDomainId,
    destinationDomainId,
    destination,
    status,
  } = message;
  const isDelivered = status === MessageStatus.Delivered;
  const chainMetadataResolver = useChainMetadataResolver();

  const originChainName = chainMetadataResolver.tryGetChainName(originDomainId) || undefined;
  const destinationChainName =
    chainMetadataResolver.tryGetChainName(destinationDomainId) || undefined;
  const destinationNativeDecimals =
    chainMetadataResolver.tryGetChainMetadata(destinationDomainId)?.nativeToken?.decimals ?? 18;

  const decodeResult = useMemo(() => decodeIcaBody(body), [body]);

  // Construct the full message bytes for calling route() on the ICA router
  const messageBytes = useMemo(() => {
    return formatMessage(
      MAILBOX_VERSION,
      nonce,
      originDomainId,
      addressToBytes32(sender),
      destinationDomainId,
      addressToBytes32(recipient),
      body,
    );
  }, [nonce, originDomainId, sender, destinationDomainId, recipient, body]);

  // For REVEAL messages, fetch the calls from the destination transaction
  const {
    data: revealCalls,
    isFetching: isRevealFetching,
    isError: isRevealError,
  } = useRevealCalls(destinationChainName, destination?.hash, msgId, decodeResult?.messageType);

  // Find related COMMITMENT <-> REVEAL message
  const {
    relatedMessage,
    relatedMessageType,
    relatedDecoded,
    isFetching: isRelatedFetching,
  } = useRelatedIcaMessage(
    message.origin.hash,
    originDomainId,
    msgId,
    decodeResult?.commitment,
    decodeResult?.messageType,
  );

  // For REVEAL messages, derive owner/ism/salt from the related COMMITMENT message
  // For CALLS/COMMITMENT messages, use the decoded data directly
  const displayOwner = decodeResult?.owner || relatedDecoded?.owner || '';
  const displayIsm = decodeResult?.ism || relatedDecoded?.ism || '';
  const displaySalt = decodeResult?.salt || relatedDecoded?.salt || '';
  const saltAddress = useMemo(() => extractAddressFromSalt(displaySalt), [displaySalt]);

  // Fetch the derived ICA address
  // For REVEAL messages, use owner/ism/salt from the related COMMITMENT message
  const {
    data: icaAddress,
    isFetching: isIcaFetching,
    isError: isIcaError,
  } = useIcaAddress(
    originChainName,
    destinationChainName,
    displayOwner || undefined,
    displayIsm || undefined,
    displaySalt || undefined,
  );

  // For REVEAL messages, fetch the CCIP Read ISM address and URLs from the destination chain
  const {
    data: ccipReadData,
    isFetching: isCcipFetching,
    isError: isCcipError,
  } = useCcipReadIsmUrls(destinationChainName, messageBytes, decodeResult?.messageType);

  // Combine calls from message body (CALLS type) or from reveal metadata (REVEAL type)
  const displayCalls = useMemo(() => {
    if (decodeResult?.messageType === IcaMessageType.CALLS) {
      return decodeResult.calls;
    }
    if (decodeResult?.messageType === IcaMessageType.REVEAL && revealCalls) {
      return revealCalls;
    }
    return [];
  }, [decodeResult, revealCalls]);

  // Get the failed call index from debug result (-1 if no failure or not available)
  const failedCallIndex = debugResult?.icaDetails?.failedCallIndex ?? -1;

  // Get block explorer URLs for call targets and ICA address
  const [explorerUrls, setExplorerUrls] = useState<Record<string, string | null>>({});

  const getExplorerUrls = useCallback(async () => {
    if (!decodeResult) return {};

    const entries: Array<readonly [string, string | null] | null> = await Promise.all([
      ...displayCalls.map(
        async (call, i) =>
          [
            `call-${i}`,
            await tryGetBlockExplorerAddressUrl(
              chainMetadataResolver,
              destinationDomainId,
              call.to,
            ),
          ] as const,
      ),
      displayOwner
        ? ([
            'owner',
            await tryGetBlockExplorerAddressUrl(
              chainMetadataResolver,
              originDomainId,
              displayOwner,
            ),
          ] as const)
        : null,
      icaAddress
        ? ([
            'ica',
            await tryGetBlockExplorerAddressUrl(
              chainMetadataResolver,
              destinationDomainId,
              icaAddress,
            ),
          ] as const)
        : null,
      saltAddress
        ? ([
            'saltAddress',
            await tryGetBlockExplorerAddressUrl(chainMetadataResolver, originDomainId, saltAddress),
          ] as const)
        : null,
      displayIsm && displayIsm !== '0x0000000000000000000000000000000000000000'
        ? ([
            'ism',
            await tryGetBlockExplorerAddressUrl(
              chainMetadataResolver,
              destinationDomainId,
              displayIsm,
            ),
          ] as const)
        : null,
    ]);

    return Object.fromEntries(
      entries.filter((entry): entry is readonly [string, string | null] => !!entry),
    );
  }, [
    decodeResult,
    displayCalls,
    destinationDomainId,
    originDomainId,
    chainMetadataResolver,
    icaAddress,
    displayOwner,
    displayIsm,
    saltAddress,
  ]);

  const messageTypeLabel = useMemo(() => {
    if (!decodeResult) return 'Unknown';
    switch (decodeResult.messageType) {
      case IcaMessageType.CALLS:
        return 'Calls';
      case IcaMessageType.COMMITMENT:
        return 'Commitment';
      case IcaMessageType.REVEAL:
        return 'Reveal';
      default:
        return 'Unknown';
    }
  }, [decodeResult]);

  const messageTypeDescription = useMemo(() => {
    if (!decodeResult) return '';
    switch (decodeResult.messageType) {
      case IcaMessageType.CALLS:
        return 'Direct execution of calls on the destination chain';
      case IcaMessageType.COMMITMENT:
        return 'First phase of commit-reveal: stores a commitment hash on the account';
      case IcaMessageType.REVEAL:
        return 'Second phase of commit-reveal: reveals and executes the committed calls';
      default:
        return '';
    }
  }, [decodeResult]);

  useEffect(() => {
    let cancelled = false;
    getExplorerUrls()
      .then((urls) => {
        if (!cancelled) setExplorerUrls(urls);
      })
      .catch(() => {
        if (!cancelled) setExplorerUrls({});
      });

    return () => {
      cancelled = true;
    };
  }, [getExplorerUrls]);

  return (
    <SectionCard
      className="w-full"
      title="Interchain Account Details"
      icon={
        <Tooltip
          id="ica-info"
          content="Details about this Interchain Account message, including the owner, derived account address, and calls to be executed on the destination chain."
        />
      }
    >
      <div className="space-y-4">
        {decodeResult ? (
          <>
            {/* Message type info */}
            <div className="text-sm text-gray-600">
              <span className="font-medium">{messageTypeLabel}</span>
              <span className="mx-1">-</span>
              <span>{messageTypeDescription}</span>
            </div>
            {/* Status section for COMMITMENT type - at the top */}
            {decodeResult.messageType === IcaMessageType.COMMITMENT && decodeResult.commitment && (
              <div>
                {relatedMessage &&
                relatedMessageType === IcaMessageType.REVEAL &&
                relatedMessage.status === MessageStatus.Delivered ? (
                  <IcaStatusPanel
                    tone="done"
                    statusLabel="Done"
                    title="Commitment Revealed"
                    commitment={decodeResult.commitment}
                    titleAccessory={
                      <Link
                        href={`/message/${relatedMessage.msgId}`}
                        className="inline-flex items-center gap-1 text-xs font-medium text-green-800 underline hover:text-green-900"
                      >
                        View REVEAL message
                      </Link>
                    }
                  />
                ) : (
                  <IcaStatusPanel
                    tone="pending"
                    statusLabel="Pending"
                    title={
                      relatedMessage && relatedMessageType === IcaMessageType.REVEAL
                        ? 'Reveal Pending Delivery'
                        : 'Commitment Pending Reveal'
                    }
                    commitment={decodeResult.commitment}
                    titleAccessory={
                      relatedMessage && relatedMessageType === IcaMessageType.REVEAL ? (
                        <Link
                          href={`/message/${relatedMessage.msgId}`}
                          className="inline-flex items-center gap-1 text-xs font-medium text-amber-800 underline hover:text-amber-900"
                        >
                          View REVEAL message
                        </Link>
                      ) : null
                    }
                    footer={
                      <>
                        <div className="mt-2 text-xs text-amber-700">
                          {relatedMessage && relatedMessageType === IcaMessageType.REVEAL
                            ? 'The REVEAL message is waiting to be delivered on the destination chain.'
                            : 'A subsequent REVEAL message with matching calls must be sent to execute.'}
                        </div>
                        {isRelatedFetching && (
                          <div className="mt-2 text-xs text-amber-600">
                            Looking for related REVEAL message...
                          </div>
                        )}
                      </>
                    }
                  />
                )}
              </div>
            )}

            {/* Status section for REVEAL type - at the top */}
            {decodeResult.messageType === IcaMessageType.REVEAL && decodeResult.commitment && (
              <div>
                {isDelivered ? (
                  <IcaStatusPanel
                    tone="done"
                    statusLabel="Done"
                    title="Commitment Revealed"
                    commitment={decodeResult.commitment}
                    titleAccessory={
                      relatedMessage && relatedMessageType === IcaMessageType.COMMITMENT ? (
                        <Link
                          href={`/message/${relatedMessage.msgId}`}
                          className="inline-flex items-center gap-1 text-xs font-medium text-green-800 underline hover:text-green-900"
                        >
                          View corresponding COMMITMENT message
                        </Link>
                      ) : null
                    }
                    footer={
                      isRelatedFetching ? (
                        <div className="mt-2 text-xs text-green-600">
                          Looking for related COMMITMENT message...
                        </div>
                      ) : null
                    }
                  />
                ) : (
                  <IcaStatusPanel
                    tone="pending"
                    statusLabel="Pending"
                    title="Revealing Commitment"
                    commitment={decodeResult.commitment}
                    titleAccessory={
                      relatedMessage && relatedMessageType === IcaMessageType.COMMITMENT ? (
                        <Link
                          href={`/message/${relatedMessage.msgId}`}
                          className="inline-flex items-center gap-1 text-xs font-medium text-amber-800 underline hover:text-amber-900"
                        >
                          View corresponding COMMITMENT message
                        </Link>
                      ) : null
                    }
                    footer={
                      <>
                        <div className="mt-2 text-xs text-amber-700">
                          Waiting for message to be delivered on the destination chain.
                        </div>
                        {isRelatedFetching && (
                          <div className="mt-2 text-xs text-amber-600">
                            Looking for related COMMITMENT message...
                          </div>
                        )}
                      </>
                    }
                  />
                )}
                {/* CCIP Read ISM section - only show when pending to help debug delivery issues */}
                {!isDelivered && (
                  <div className="mt-3 rounded border border-gray-200 bg-gray-50 p-3">
                    <label className="text-xs font-medium text-gray-600">CCIP Read Gateway</label>
                    {isCcipFetching ? (
                      <div className="mt-2 text-xs text-gray-500">Fetching gateway URLs...</div>
                    ) : ccipReadData?.urls && ccipReadData.urls.length > 0 ? (
                      <div className="mt-2 space-y-1">
                        {ccipReadData.urls.map((url, i) => (
                          <div key={i} className="break-all font-mono text-xs text-gray-600">
                            {url}
                          </div>
                        ))}
                      </div>
                    ) : isCcipError ? (
                      <div className="mt-2 text-xs text-red-600">
                        Failed to fetch gateway URLs from ISM contract.
                      </div>
                    ) : (
                      <div className="mt-2 text-xs text-gray-500">
                        No gateway URLs configured. The ISM may not support CCIP Read.
                      </div>
                    )}
                    <div className="mt-2 text-xs text-gray-500">
                      The secret calls must be posted to this gateway by the commitment sender, who
                      specifies which relayers are authorized to fetch and deliver the calls.
                    </div>
                    <div className="mt-2 text-xs text-amber-600">
                      If delivery is failing, the calls may not have been posted to the gateway, or
                      no authorized relayer is available.
                    </div>
                  </div>
                )}
              </div>
            )}

            {displayOwner && (
              <KeyValueRow
                label="Owner:"
                labelWidth="w-28 sm:w-36"
                display={displayOwner}
                displayWidth="flex-1 min-w-0"
                link={explorerUrls['owner'] || undefined}
                showCopy={true}
                blurValue={blur}
              />
            )}

            {/* Show ICA address when we have owner data */}
            {displayOwner && (
              <KeyValueRow
                label="Account:"
                labelWidth="w-28 sm:w-36"
                display={
                  icaAddress
                    ? icaAddress
                    : isIcaFetching
                      ? 'Computing...'
                      : isIcaError
                        ? 'Error computing'
                        : 'Unknown'
                }
                displayWidth="flex-1 min-w-0"
                link={icaAddress ? explorerUrls['ica'] || undefined : undefined}
                showCopy={!!icaAddress}
                blurValue={blur}
              />
            )}

            {/* Show ISM when available and non-zero */}
            {displayIsm && displayIsm !== '0x0000000000000000000000000000000000000000' && (
              <KeyValueRow
                label="ISM:"
                labelWidth="w-28 sm:w-36"
                display={displayIsm}
                displayWidth="flex-1 min-w-0"
                link={explorerUrls['ism'] || undefined}
                showCopy={true}
                blurValue={blur}
              />
            )}

            {displaySalt && displaySalt !== '0x' + '0'.repeat(64) && (
              <>
                <KeyValueRow
                  label="Salt:"
                  labelWidth="w-28 sm:w-36"
                  display={displaySalt}
                  displayWidth="flex-1 min-w-0"
                  showCopy={true}
                  blurValue={blur}
                />
                {saltAddress && (
                  <KeyValueRow
                    label="User:"
                    labelWidth="w-28 sm:w-36"
                    display={saltAddress}
                    displayWidth="flex-1 min-w-0"
                    link={explorerUrls['saltAddress'] || undefined}
                    showCopy={true}
                    blurValue={blur}
                  />
                )}
              </>
            )}

            {/* Show calls for CALLS type or REVEAL type (when fetched) */}
            {(decodeResult.messageType === IcaMessageType.CALLS ||
              decodeResult.messageType === IcaMessageType.REVEAL) && (
              <div className="space-y-3 pt-2">
                <label className="text-sm font-medium text-gray-700">
                  {isDelivered ? 'Calls executed:' : 'Calls to execute:'}
                </label>

                {/* Loading state for reveal calls */}
                {decodeResult.messageType === IcaMessageType.REVEAL && isRevealFetching && (
                  <div className="py-2 text-sm italic text-gray-500">
                    Fetching calls from destination transaction...
                  </div>
                )}

                {/* Error state for reveal calls */}
                {decodeResult.messageType === IcaMessageType.REVEAL &&
                  isRevealError &&
                  !revealCalls && (
                    <div className="py-2 text-sm italic text-gray-500">
                      Could not fetch calls from destination transaction.
                    </div>
                  )}

                {/* No destination tx yet for reveal */}
                {decodeResult.messageType === IcaMessageType.REVEAL &&
                  !destination?.hash &&
                  !isRevealFetching && (
                    <div className="py-2 text-sm italic text-gray-500">
                      Calls will be shown once the message is processed on the destination chain.
                    </div>
                  )}

                {/* Display calls */}
                {displayCalls.length > 0 &&
                  displayCalls.map((call, i) => (
                    <IcaCallDetails
                      key={`ica-call-${i}`}
                      call={call}
                      index={i}
                      total={displayCalls.length}
                      explorerUrl={explorerUrls[`call-${i}`]}
                      blur={blur}
                      failedCallIndex={failedCallIndex}
                      nativeDecimals={destinationNativeDecimals}
                    />
                  ))}

                {/* Empty calls for CALLS type */}
                {decodeResult.messageType === IcaMessageType.CALLS &&
                  decodeResult.calls.length === 0 && (
                    <div className="py-2 text-sm italic text-gray-500">
                      No calls in this message.
                    </div>
                  )}
              </div>
            )}
          </>
        ) : (
          <div className="py-4 italic text-red-500">
            Unable to decode Interchain Account message body. The message format may be
            unrecognized.
          </div>
        )}
      </div>
    </SectionCard>
  );
}

function IcaCallDetails({
  call,
  index,
  total,
  explorerUrl,
  blur,
  failedCallIndex,
  nativeDecimals,
}: {
  call: IcaCall;
  index: number;
  total: number;
  explorerUrl: string | null | undefined;
  blur: boolean;
  failedCallIndex: number;
  nativeDecimals: number;
}) {
  const { hasValue, formattedValue } = useMemo(
    () => getFormattedCallValue(call.value, nativeDecimals),
    [call.value, nativeDecimals],
  );

  const isFailed = failedCallIndex === index;

  return (
    <div
      className={clsx(
        'rounded border p-3',
        isFailed ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-gray-50',
      )}
    >
      <label className={clsx('text-xs font-medium', isFailed ? 'text-red-600' : 'text-gray-600')}>
        {`Call ${index + 1} of ${total}${isFailed ? ' - Failed' : ''}`}
      </label>
      <div className="mt-2 space-y-2">
        <KeyValueRow
          label="Target:"
          labelWidth="w-16 sm:w-20"
          display={call.to}
          displayWidth="w-52 sm:w-72"
          link={explorerUrl || undefined}
          showCopy={true}
          blurValue={blur}
        />
        {hasValue && (
          <KeyValueRow
            label="Value:"
            labelWidth="w-16 sm:w-20"
            display={`${formattedValue} (native)`}
            displayWidth="w-52 sm:w-72"
            showCopy={false}
            blurValue={blur}
          />
        )}
        <KeyValueRow
          label="Data:"
          labelWidth="w-16 sm:w-20"
          display={call.data}
          displayWidth="w-52 sm:w-80 lg:w-96"
          showCopy={true}
          blurValue={blur}
        />
      </div>
    </div>
  );
}
