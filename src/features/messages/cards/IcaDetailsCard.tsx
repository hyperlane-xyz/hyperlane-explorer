import { MAILBOX_VERSION, MultiProtocolProvider } from '@hyperlane-xyz/sdk';
import {
  addressToBytes32,
  bytes32ToAddress,
  formatMessage,
  fromWei,
  shortenAddress,
  strip0x,
} from '@hyperlane-xyz/utils';
import { CopyButton, Tooltip } from '@hyperlane-xyz/widgets';
import { useQuery } from '@tanstack/react-query';
import { BigNumber, Contract, utils } from 'ethers';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { SectionCard } from '../../../components/layout/SectionCard';
import { useMultiProvider } from '../../../store';
import { IcaCall, Message, MessageStatus } from '../../../types';
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
  message: Message;
  blur: boolean;
  debugResult?: MessageDebugResult;
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
  const multiProvider = useMultiProvider();

  const originChainName = multiProvider.tryGetChainName(originDomainId) || undefined;
  const destinationChainName = multiProvider.tryGetChainName(destinationDomainId) || undefined;

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
    msgId,
    decodeResult?.commitment,
    decodeResult?.messageType,
  );

  // For REVEAL messages, derive owner/ism/salt from the related COMMITMENT message
  // For CALLS/COMMITMENT messages, use the decoded data directly
  const displayOwner = decodeResult?.owner || relatedDecoded?.owner || '';
  const displayIsm = decodeResult?.ism || relatedDecoded?.ism || '';
  const displaySalt = decodeResult?.salt || relatedDecoded?.salt || '';

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
    if (!decodeResult) return;

    const urls: Record<string, string | null> = {};

    // Get URLs for call targets
    for (let i = 0; i < displayCalls.length; i++) {
      const call = displayCalls[i];
      urls[`call-${i}`] = await tryGetBlockExplorerAddressUrl(
        multiProvider,
        destinationDomainId,
        call.to,
      );
    }

    // Get URL for owner on origin chain (use derived value for REVEAL messages)
    if (displayOwner) {
      urls['owner'] = await tryGetBlockExplorerAddressUrl(
        multiProvider,
        originDomainId,
        displayOwner,
      );
    }

    // Get URL for ICA address on destination chain
    if (icaAddress) {
      urls['ica'] = await tryGetBlockExplorerAddressUrl(
        multiProvider,
        destinationDomainId,
        icaAddress,
      );
    }

    // Get URL for salt address on origin chain (use derived value for REVEAL messages)
    const saltAddress = extractAddressFromSalt(displaySalt);
    if (saltAddress) {
      urls['saltAddress'] = await tryGetBlockExplorerAddressUrl(
        multiProvider,
        originDomainId,
        saltAddress,
      );
    }

    // Get URL for ISM address on destination chain (use derived value for REVEAL messages)
    if (displayIsm && displayIsm !== '0x0000000000000000000000000000000000000000') {
      urls['ism'] = await tryGetBlockExplorerAddressUrl(
        multiProvider,
        destinationDomainId,
        displayIsm,
      );
    }

    setExplorerUrls(urls);
  }, [
    decodeResult,
    displayCalls,
    destinationDomainId,
    originDomainId,
    multiProvider,
    icaAddress,
    displayOwner,
    displayIsm,
    displaySalt,
  ]);

  useEffect(() => {
    getExplorerUrls().catch(() => setExplorerUrls({}));
  }, [getExplorerUrls]);

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

  return (
    <SectionCard
      className="w-full space-y-4"
      title="Interchain Account Details"
      icon={
        <Tooltip
          id="ica-info"
          content="Details about this Interchain Account message, including the owner, derived account address, and calls to be executed on the destination chain."
        />
      }
    >
      {decodeResult ? (
        <>
          {/* Message type info */}
          <div className="text-sm text-gray-600">
            <span className="font-medium">{messageTypeLabel}</span>
            <span className="mx-1">—</span>
            <span>{messageTypeDescription}</span>
          </div>

          {/* Status section for COMMITMENT type - at the top */}
          {decodeResult.messageType === IcaMessageType.COMMITMENT && decodeResult.commitment && (
            <div>
              {relatedMessage &&
              relatedMessageType === IcaMessageType.REVEAL &&
              relatedMessage.status === MessageStatus.Delivered ? (
                <div className="rounded-md border border-green-200/50 bg-green-100/20 p-3">
                  <div className="flex items-start gap-2">
                    <span className="text-green-400">✓</span>
                    <div className="flex-1">
                      <div className="text-sm font-medium text-green-500">Commitment Revealed</div>
                      <div className="mt-2 flex items-start gap-2">
                        <div className="min-w-0 flex-1 break-all font-mono text-xs text-gray-600">
                          {decodeResult.commitment}
                        </div>
                        <CopyButton
                          copyValue={decodeResult.commitment}
                          width={12}
                          height={12}
                          className="mt-0.5 shrink-0 opacity-60 hover:opacity-100"
                        />
                      </div>
                      <div className="mt-2">
                        <Link
                          href={`/message/${relatedMessage.msgId}`}
                          className="inline-flex items-center gap-1 text-xs font-medium text-green-500 underline hover:text-green-400"
                        >
                          View REVEAL message →
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-md border border-primary-100/40 bg-primary-25/20 p-3">
                  <div className="flex items-start gap-2">
                    <span className="text-primary-200">⏳</span>
                    <div className="flex-1">
                      <div className="text-sm font-medium text-primary-300">
                        {relatedMessage && relatedMessageType === IcaMessageType.REVEAL
                          ? 'Reveal Pending Delivery'
                          : 'Commitment Pending Reveal'}
                      </div>
                      <div className="mt-2 flex items-start gap-2">
                        <div className="min-w-0 flex-1 break-all font-mono text-xs text-gray-600">
                          {decodeResult.commitment}
                        </div>
                        <CopyButton
                          copyValue={decodeResult.commitment}
                          width={12}
                          height={12}
                          className="mt-0.5 shrink-0 opacity-60 hover:opacity-100"
                        />
                      </div>
                      <div className="mt-2 text-xs text-primary-200">
                        {relatedMessage && relatedMessageType === IcaMessageType.REVEAL
                          ? 'The REVEAL message is waiting to be delivered on the destination chain.'
                          : 'A subsequent REVEAL message with matching calls must be sent to execute.'}
                      </div>
                      {relatedMessage && relatedMessageType === IcaMessageType.REVEAL && (
                        <div className="mt-2">
                          <Link
                            href={`/message/${relatedMessage.msgId}`}
                            className="inline-flex items-center gap-1 text-xs font-medium text-primary-300 underline hover:text-primary-200"
                          >
                            View REVEAL message →
                          </Link>
                        </div>
                      )}
                      {isRelatedFetching && (
                        <div className="mt-2 text-xs text-primary-100">
                          Looking for related REVEAL message...
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Status section for REVEAL type - at the top */}
          {decodeResult.messageType === IcaMessageType.REVEAL && decodeResult.commitment && (
            <div>
              {isDelivered ? (
                <div className="rounded-md border border-green-200/50 bg-green-100/20 p-3">
                  <div className="flex items-start gap-2">
                    <span className="text-green-400">✓</span>
                    <div className="flex-1">
                      <div className="text-sm font-medium text-green-500">Commitment Revealed</div>
                      <div className="mt-2 flex items-start gap-2">
                        <div className="min-w-0 flex-1 break-all font-mono text-xs text-gray-600">
                          {decodeResult.commitment}
                        </div>
                        <CopyButton
                          copyValue={decodeResult.commitment}
                          width={12}
                          height={12}
                          className="mt-0.5 shrink-0 opacity-60 hover:opacity-100"
                        />
                      </div>
                      {relatedMessage && relatedMessageType === IcaMessageType.COMMITMENT && (
                        <div className="mt-2">
                          <Link
                            href={`/message/${relatedMessage.msgId}`}
                            className="inline-flex items-center gap-1 text-xs font-medium text-green-500 underline hover:text-green-400"
                          >
                            ← View corresponding COMMITMENT message
                          </Link>
                        </div>
                      )}
                      {isRelatedFetching && (
                        <div className="mt-2 text-xs text-green-400">
                          Looking for related COMMITMENT message...
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-md border border-primary-100/40 bg-primary-25/20 p-3">
                  <div className="flex items-start gap-2">
                    <span className="text-primary-200">⏳</span>
                    <div className="flex-1">
                      <div className="text-sm font-medium text-primary-300">
                        Revealing Commitment
                      </div>
                      <div className="mt-2 flex items-start gap-2">
                        <div className="min-w-0 flex-1 break-all font-mono text-xs text-gray-600">
                          {decodeResult.commitment}
                        </div>
                        <CopyButton
                          copyValue={decodeResult.commitment}
                          width={12}
                          height={12}
                          className="mt-0.5 shrink-0 opacity-60 hover:opacity-100"
                        />
                      </div>
                      <div className="mt-2 text-xs text-primary-200">
                        Waiting for message to be delivered on the destination chain.
                      </div>
                      {relatedMessage && relatedMessageType === IcaMessageType.COMMITMENT && (
                        <div className="mt-2">
                          <Link
                            href={`/message/${relatedMessage.msgId}`}
                            className="inline-flex items-center gap-1 text-xs font-medium text-primary-300 underline hover:text-primary-200"
                          >
                            ← View corresponding COMMITMENT message
                          </Link>
                        </div>
                      )}
                      {isRelatedFetching && (
                        <div className="mt-2 text-xs text-primary-100">
                          Looking for related COMMITMENT message...
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
              {/* CCIP Read ISM section - only show when pending to help debug delivery issues */}
              {!isDelivered && (
                <div className="mt-3 rounded-md border border-gray-200 bg-gray-50 p-3">
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
                  <div className="mt-2 text-xs text-primary-200">
                    If delivery is failing, the calls may not have been posted to the gateway, or no
                    authorized relayer is available.
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
              {(() => {
                const saltAddress = extractAddressFromSalt(displaySalt);
                if (!saltAddress) return null;
                return (
                  <KeyValueRow
                    label="↳ User:"
                    labelWidth="w-28 sm:w-36"
                    display={saltAddress}
                    displayWidth="flex-1 min-w-0"
                    link={explorerUrls['saltAddress'] || undefined}
                    showCopy={true}
                    blurValue={blur}
                  />
                );
              })()}
            </>
          )}

          {/* Show calls for CALLS type or REVEAL type (when fetched) */}
          {(decodeResult.messageType === IcaMessageType.CALLS ||
            decodeResult.messageType === IcaMessageType.REVEAL) && (
            <div className="space-y-3 pt-2">
              <label
                className={`text-sm font-medium ${isDelivered ? 'text-green-500' : 'text-primary-300'}`}
              >
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
                    isDelivered={isDelivered}
                    failedCallIndex={failedCallIndex}
                    multiProvider={multiProvider}
                    destinationChainName={destinationChainName}
                  />
                ))}

              {/* Empty calls for CALLS type */}
              {decodeResult.messageType === IcaMessageType.CALLS &&
                decodeResult.calls.length === 0 && (
                  <div className="py-2 text-sm italic text-gray-500">No calls in this message.</div>
                )}
            </div>
          )}
        </>
      ) : (
        <div className="py-4 italic text-red-500">
          Unable to decode Interchain Account message body. The message format may be unrecognized.
        </div>
      )}
    </SectionCard>
  );
}

// Known function selectors for calldata decoding
const KNOWN_SELECTORS: Record<string, { name: string; sig: string }> = {
  '0x095ea7b3': { name: 'approve', sig: 'approve(address,uint256)' },
  '0xa9059cbb': { name: 'transfer', sig: 'transfer(address,uint256)' },
  '0x81b4e8b4': { name: 'transferRemote', sig: 'transferRemote(uint32,bytes32,uint256)' },
  '0x51debffc': {
    name: 'transferRemote',
    sig: 'transferRemote(uint32,bytes32,uint256,bytes,address)',
  },
  '0x3593564c': { name: 'execute', sig: 'execute(bytes,bytes[],uint256)' },
};

interface DecodedCallInfo {
  functionName: string;
  summary: string;
  // For Uniswap swaps: token addresses to resolve symbols
  swapTokenIn?: string;
  swapTokenOut?: string;
}

/**
 * Extract swap token addresses from Uniswap Universal Router execute() calldata.
 * Supports V3_SWAP_EXACT_IN (0x00) and V3_SWAP_EXACT_OUT (0x01).
 */
function decodeUniswapSwap(data: string): { tokenIn: string; tokenOut: string } | null {
  try {
    const iface = new utils.Interface(['function execute(bytes,bytes[],uint256)']);
    const decoded = iface.decodeFunctionData('execute', data);
    const commands = strip0x(decoded[0] as string);
    const inputs = decoded[1] as string[];

    for (let i = 0; i < commands.length / 2; i++) {
      const cmd = parseInt(commands.slice(i * 2, i * 2 + 2), 16);

      if (cmd === 0x00) {
        // V3_SWAP_EXACT_IN: (address, uint256, uint256, bytes path, bool)
        const args = utils.defaultAbiCoder.decode(
          ['address', 'uint256', 'uint256', 'bytes', 'bool'],
          utils.hexDataSlice(inputs[i], 0),
        );
        const path = strip0x(args[3] as string);
        return { tokenIn: '0x' + path.slice(0, 40), tokenOut: '0x' + path.slice(-40) };
      }

      if (cmd === 0x01) {
        // V3_SWAP_EXACT_OUT: path is reversed (tokenOut first)
        const args = utils.defaultAbiCoder.decode(
          ['address', 'uint256', 'uint256', 'bytes', 'bool'],
          utils.hexDataSlice(inputs[i], 0),
        );
        const path = strip0x(args[3] as string);
        return { tokenIn: '0x' + path.slice(-40), tokenOut: '0x' + path.slice(0, 40) };
      }
    }
    return null;
  } catch {
    return null;
  }
}

function tryDecodeCallData(
  data: string,
  multiProvider: MultiProtocolProvider,
): DecodedCallInfo | null {
  if (!data || data.length < 10) return null;

  const selector = data.slice(0, 10).toLowerCase();
  const known = KNOWN_SELECTORS[selector];
  if (!known) return null;

  try {
    const iface = new utils.Interface([`function ${known.sig}`]);
    const decoded = iface.decodeFunctionData(known.name, data);

    switch (known.name) {
      case 'approve': {
        const spender = shortenAddress(decoded[0] as string);
        const amount = formatTokenAmount(decoded[1] as BigNumber);
        return { functionName: 'approve', summary: `Approve ${spender} to spend ${amount}` };
      }
      case 'transfer': {
        const to = shortenAddress(decoded[0] as string);
        const amount = formatTokenAmount(decoded[1] as BigNumber);
        return { functionName: 'transfer', summary: `Transfer ${amount} to ${to}` };
      }
      case 'transferRemote': {
        const destDomain = (decoded[0] as number) || BigNumber.from(decoded[0]).toNumber();
        const recipient = shortenAddress(bytes32ToAddress(decoded[1] as string));
        const amount = formatTokenAmount(decoded[2] as BigNumber);
        const chainName = multiProvider.tryGetChainName(destDomain);
        const dest = chainName || `domain ${destDomain}`;
        return {
          functionName: 'transferRemote',
          summary: `Bridge ${amount} to ${recipient} on ${dest}`,
        };
      }
      case 'execute': {
        const swap = decodeUniswapSwap(data);
        if (swap) {
          return {
            functionName: 'swap',
            summary: `Swap ${shortenAddress(swap.tokenIn)} → ${shortenAddress(swap.tokenOut)}`,
            swapTokenIn: swap.tokenIn,
            swapTokenOut: swap.tokenOut,
          };
        }
        return { functionName: 'execute', summary: 'Uniswap swap' };
      }
      default:
        return null;
    }
  } catch {
    return null;
  }
}

function formatTokenAmount(amount: BigNumber): string {
  // Try common decimals (18, then 6) to produce a reasonable display
  const wei18 = fromWei(amount.toString(), 18);
  const num18 = parseFloat(wei18);
  // If 18-decimal interpretation is extremely small, try 6 decimals
  if (num18 > 0 && num18 < 0.000001) {
    const wei6 = fromWei(amount.toString(), 6);
    return `${parseFloat(wei6).toLocaleString()} tokens`;
  }
  if (num18 === 0) return '0';
  return `${num18.toLocaleString()} tokens`;
}

const ERC20_SYMBOL_ABI = ['function symbol() view returns (string)'];

/**
 * Resolve an ERC20 token symbol via RPC. Cached indefinitely since symbols don't change.
 */
function useTokenSymbol(
  chainName: string | undefined,
  tokenAddress: string | undefined,
  multiProvider: MultiProtocolProvider,
) {
  return useQuery({
    queryKey: ['tokenSymbol', chainName, tokenAddress],
    queryFn: async () => {
      if (!chainName || !tokenAddress) return null;
      const provider = multiProvider.getEthersV5Provider(chainName);
      const contract = new Contract(tokenAddress, ERC20_SYMBOL_ABI, provider);
      return (await contract.symbol()) as string;
    },
    enabled: !!chainName && !!tokenAddress,
    staleTime: Infinity,
    retry: false,
  });
}

function IcaCallDetails({
  call,
  index,
  total,
  explorerUrl,
  blur,
  isDelivered,
  failedCallIndex,
  multiProvider,
  destinationChainName,
}: {
  call: IcaCall;
  index: number;
  total: number;
  explorerUrl: string | null | undefined;
  blur: boolean;
  isDelivered: boolean;
  failedCallIndex: number; // -1 if no failure, otherwise 0-based index of failed call
  multiProvider: MultiProtocolProvider;
  destinationChainName: string | undefined;
}) {
  // Defensive handling for BigNumber conversion - malformed values shouldn't crash the card
  let hasValue = false;
  let formattedValue = '0';
  try {
    hasValue = BigNumber.from(call.value).gt(0);
    formattedValue = hasValue ? fromWei(call.value, 18) : '0';
  } catch {
    // Malformed value, use defaults
  }

  // Try to decode the calldata
  const decoded = useMemo(
    () => tryDecodeCallData(call.data, multiProvider),
    [call.data, multiProvider],
  );

  // Resolve token symbols for swap calls
  const { data: symbolIn } = useTokenSymbol(
    destinationChainName,
    decoded?.swapTokenIn,
    multiProvider,
  );
  const { data: symbolOut } = useTokenSymbol(
    destinationChainName,
    decoded?.swapTokenOut,
    multiProvider,
  );

  // Build display summary, enriching with resolved symbols
  const displaySummary = useMemo(() => {
    if (!decoded) return null;
    if (decoded.swapTokenIn && (symbolIn || symbolOut)) {
      const tokenIn = symbolIn || shortenAddress(decoded.swapTokenIn);
      const tokenOut = symbolOut || shortenAddress(decoded.swapTokenOut!);
      return `Swap ${tokenIn} → ${tokenOut}`;
    }
    return decoded.summary;
  }, [decoded, symbolIn, symbolOut]);

  // Determine call state for styling
  const isFailed = failedCallIndex === index;

  // Determine styling based on state
  let borderClass: string;
  let labelClass: string;
  let statusSuffix = '';

  if (isDelivered) {
    // All calls succeeded
    borderClass = 'border-green-200/50 bg-green-100/20';
    labelClass = 'text-green-500';
  } else if (isFailed) {
    // This specific call failed
    borderClass = 'border-red-200/50 bg-red-100/15';
    labelClass = 'text-red-500';
    statusSuffix = ' — Failed';
  } else {
    // Pending (either not checked yet, or after a failed call)
    borderClass = 'border-primary-100/40 bg-primary-25/20';
    labelClass = 'text-primary-300';
  }

  return (
    <div className={`rounded-md border p-3 ${borderClass}`}>
      <div className="flex items-baseline gap-2">
        <label className={`text-xs font-medium ${labelClass}`}>
          {`Call ${index + 1} of ${total}${statusSuffix}`}
        </label>
        {decoded && (
          <span className="text-xs text-gray-500">
            {decoded.functionName}() — {displaySummary}
          </span>
        )}
      </div>
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
