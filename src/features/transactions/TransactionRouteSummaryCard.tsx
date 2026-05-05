import type { ChainMetadata, TokenArgs } from '@hyperlane-xyz/sdk';
import { PROTOCOL_TO_NATIVE_STANDARD, TokenStandard } from '@hyperlane-xyz/sdk';
import { fromWei, isEVMLike, ProtocolType } from '@hyperlane-xyz/utils';
import { Tooltip } from '@hyperlane-xyz/widgets';
import { useQuery } from '@tanstack/react-query';
import { BigNumber, Contract, utils } from 'ethers';
import { useMemo } from 'react';

import { TokenIcon } from '../../components/icons/TokenIcon';
import { SectionCard } from '../../components/layout/SectionCard';
import { useChainMetadataResolver } from '../../metadataStore';
import { useMultiProviderVersion, useReadyMultiProvider, useStore } from '../../store';
import { IcaCall, Message, WarpRouteDetails } from '../../types';
import { formatAmountWithCommas } from '../../utils/amount';
import { getTokenFromWarpRouteChainAddressMap } from '../../utils/token';
import { getBlockExplorerAddressUrl } from '../../utils/url';
import { getChainDisplayName } from '../chains/utils';
import type { ExplorerMultiProvider } from '../hyperlane/sdkRuntime';
import { KeyValueRow } from '../messages/cards/KeyValueRow';
import {
  DecodedIcaMessage,
  decodeIcaBody,
  decodeIcaCallData,
  decodeMulticallIcaCalls,
  IcaMessageType,
  isIcaMessage,
  useRevealCalls,
} from '../messages/ica';
import { parseWarpRouteMessageDetails } from '../messages/utils';

interface IcaCandidate {
  message: Message;
  decoded: DecodedIcaMessage;
  destinationChainName: string | undefined;
}

type RouteOutput = (
  | { type: 'token'; address: string }
  | { type: 'native'; address?: undefined }
) & {
  outputAmount?: string;
  outputAmountKind?: 'exact' | 'minimum';
  wrappedNativeToken?: string;
  outputRecipients?: string[];
};

const TOKEN_METADATA_STRING_ABI = [
  'function symbol() view returns (string)',
  'function name() view returns (string)',
  'function decimals() view returns (uint8)',
];
const TOKEN_METADATA_BYTES32_ABI = [
  'function symbol() view returns (bytes32)',
  'function name() view returns (bytes32)',
];
const ERC20_TRANSFER_TOPIC = utils.id('Transfer(address,address,uint256)');
const WETH_WITHDRAWAL_TOPIC = utils.id('Withdrawal(address,uint256)');

export function TransactionRouteSummaryCard({
  messages,
  className,
}: {
  messages: Message[];
  className?: string;
}) {
  const chainMetadataResolver = useChainMetadataResolver();
  const warpRouteChainAddressMap = useStore((s) => s.warpRouteChainAddressMap);

  const warpRoute = useMemo(() => {
    for (const message of messages) {
      const details = parseWarpRouteMessageDetails(
        message,
        warpRouteChainAddressMap,
        chainMetadataResolver,
      );
      if (details) return { message, details };
    }
    return undefined;
  }, [chainMetadataResolver, messages, warpRouteChainAddressMap]);

  const icaCandidate = useMemo<IcaCandidate | undefined>(() => {
    let fallback: IcaCandidate | undefined;

    for (const message of messages) {
      if (!isIcaMessage({ sender: message.sender, recipient: message.recipient })) continue;
      const decoded = decodeIcaBody(message.body);
      if (!decoded) continue;

      const candidate = {
        message,
        decoded,
        destinationChainName:
          chainMetadataResolver.tryGetChainName(message.destinationDomainId) || undefined,
      };

      if (
        decoded.messageType === IcaMessageType.CALLS ||
        decoded.messageType === IcaMessageType.REVEAL
      ) {
        return candidate;
      }

      fallback ??= candidate;
    }

    return fallback;
  }, [chainMetadataResolver, messages]);

  const { data: revealCalls } = useRevealCalls(
    icaCandidate?.destinationChainName,
    icaCandidate?.message.destination?.hash,
    icaCandidate?.message.msgId,
    icaCandidate?.decoded.messageType,
  );

  const route = useMemo(() => {
    if (!warpRoute) return undefined;

    const calls =
      icaCandidate?.decoded.messageType === IcaMessageType.CALLS
        ? icaCandidate.decoded.calls
        : (revealCalls ?? []);
    const output = findSwapOutput(calls, icaCandidate?.destinationChainName, (domainId) => {
      return chainMetadataResolver.tryGetChainName(domainId) || undefined;
    });

    return {
      warpMessage: warpRoute.message,
      warpDetails: warpRoute.details,
      destinationChainName:
        icaCandidate?.destinationChainName ||
        chainMetadataResolver.tryGetChainName(warpRoute.message.destinationDomainId) ||
        undefined,
      destinationDomainId:
        icaCandidate?.message.destinationDomainId ?? warpRoute.message.destinationDomainId,
      destinationTxHash: icaCandidate?.message.destination?.hash,
      output,
    };
  }, [chainMetadataResolver, icaCandidate, revealCalls, warpRoute]);

  if (!warpRoute) return null;

  if (!route?.output) return null;

  return (
    <DecodedRouteCard
      warpMessage={route.warpMessage}
      warpDetails={route.warpDetails}
      destinationChainName={route.destinationChainName}
      destinationDomainId={route.destinationDomainId}
      destinationTxHash={route.destinationTxHash}
      output={route.output}
      className={className}
    />
  );
}

function DecodedRouteCard({
  warpMessage,
  warpDetails,
  destinationChainName,
  destinationDomainId,
  destinationTxHash,
  output,
  className,
}: {
  warpMessage: Message;
  warpDetails: WarpRouteDetails;
  destinationChainName: string | undefined;
  destinationDomainId: number;
  destinationTxHash: string | undefined;
  output: RouteOutput;
  className?: string;
}) {
  const chainMetadataResolver = useChainMetadataResolver();
  const warpRouteChainAddressMap = useStore((s) => s.warpRouteChainAddressMap);

  const originChainName = chainMetadataResolver.tryGetChainName(warpMessage.originDomainId);
  const originDisplayName = getChainDisplayName(
    chainMetadataResolver,
    originChainName || undefined,
    false,
    false,
  );
  const destinationDisplayName = getChainDisplayName(
    chainMetadataResolver,
    destinationChainName,
    false,
    false,
  );
  const originTokenAddress = warpDetails.originToken.addressOrDenom || '';
  const destinationMetadata = destinationChainName
    ? chainMetadataResolver.tryGetChainMetadata(destinationChainName) || undefined
    : undefined;
  const nativeOutputToken =
    output.type === 'native' && destinationMetadata
      ? getNativeTokenArgs(destinationMetadata)
      : undefined;
  const registryOutputToken =
    output.type === 'token' && output.address && destinationMetadata
      ? getTokenFromWarpRouteChainAddressMap(
          destinationMetadata,
          output.address,
          warpRouteChainAddressMap,
        )
      : undefined;
  const onchainOutputToken = useOnchainOutputToken(
    destinationChainName,
    destinationMetadata,
    output.type === 'token' ? output.address : undefined,
    !registryOutputToken,
  );
  const outputToken =
    output.type === 'native' ? nativeOutputToken : registryOutputToken || onchainOutputToken;
  const outputDisplay =
    output.type === 'native'
      ? outputToken?.symbol || 'Native token'
      : outputToken?.symbol || output.address;
  const outputTokenAddressOrDenom =
    output.type === 'token' ? output.address : nativeOutputToken?.addressOrDenom;
  const outputExplorerUrl =
    output.type === 'token'
      ? getBlockExplorerAddressUrl(chainMetadataResolver, destinationDomainId, output.address)
      : undefined;
  const actualOutputAmount = useActualOutputAmount(
    destinationChainName,
    destinationMetadata,
    destinationTxHash,
    output,
  );
  const inputDisplay = `${formatAmountWithCommas(warpDetails.amount)} ${warpDetails.originToken.symbol}`;
  const outputAmountValue = formatRawAmount(
    actualOutputAmount || output.outputAmount,
    outputToken?.decimals,
  );
  const outputAmountDisplay = formatOutputAmount(
    outputAmountValue,
    outputDisplay,
    actualOutputAmount ? undefined : output.outputAmountKind,
  );
  const outputSummaryDisplay = outputAmountDisplay || outputDisplay;
  const banner = `${inputDisplay} on ${originDisplayName} for ${outputSummaryDisplay} on ${destinationDisplayName}`;
  const tooltip =
    'Overview decoded from the origin warp transfer and destination ICA swap calldata.';

  return (
    <SectionCard
      className={className}
      title="Transaction Overview"
      icon={<Tooltip id="transaction-route-info" content={tooltip} placement="bottom-end" />}
    >
      <div className="flex gap-4 sm:gap-6">
        <NetSwapTokenLogos originToken={warpDetails.originToken} outputToken={outputToken} />
        <div className="min-w-0 flex-1 space-y-4">
          <div className="rounded bg-primary-50 px-3 py-2 text-xs text-primary-700">
            <span className="font-medium">Swapped:</span> {banner}
          </div>
          <div className="grid grid-cols-1 gap-y-1.5 sm:grid-cols-2 sm:gap-x-2">
            <KeyValueRow
              label="Input:"
              labelWidth={styles.labelWidthSm}
              display={inputDisplay}
              tooltip={originTokenAddress || undefined}
              copyValue={warpDetails.amount}
              link={getBlockExplorerAddressUrl(
                chainMetadataResolver,
                warpMessage.originDomainId,
                originTokenAddress,
              )}
              showCopy
            />
            <KeyValueRow
              label="Origin:"
              labelWidth={styles.labelWidthSm}
              display={originDisplayName}
            />
            <KeyValueRow
              label="Output:"
              labelWidth={styles.labelWidthSm}
              display={outputSummaryDisplay}
              tooltip={outputTokenAddressOrDenom}
              copyValue={outputAmountValue || outputTokenAddressOrDenom}
              link={outputExplorerUrl}
              showCopy={output.type !== 'native'}
              truncateMiddle={output.type === 'token' && !outputToken?.symbol}
            />
            <KeyValueRow
              label="Destination:"
              labelWidth={styles.labelWidthSm}
              display={destinationDisplayName}
            />
          </div>
        </div>
      </div>
    </SectionCard>
  );
}

function findSwapOutput(
  calls: IcaCall[],
  destinationChainName: string | undefined,
  tryGetChainName: (domainId: number) => string | undefined,
): RouteOutput | undefined {
  const expandedCalls = calls.flatMap((call) => [
    call,
    ...(decodeMulticallIcaCalls(call, destinationChainName) ?? []),
  ]);

  let output: RouteOutput | undefined;

  for (const call of expandedCalls) {
    const decoded = decodeIcaCallData(call.data, tryGetChainName);
    if (decoded?.swap) {
      output =
        decoded.swap.tokenOutType === 'native'
          ? {
              type: 'native',
              outputAmount: decoded.swap.outputAmount,
              outputAmountKind: decoded.swap.outputAmountKind,
              wrappedNativeToken: decoded.swap.wrappedNativeToken,
              outputRecipients: decoded.swap.outputRecipients,
            }
          : {
              type: 'token',
              address: decoded.swap.tokenOut,
              outputAmount: decoded.swap.outputAmount,
              outputAmountKind: decoded.swap.outputAmountKind,
              outputRecipients: decoded.swap.outputRecipients,
            };
    }
  }

  return output;
}

function useActualOutputAmount(
  chainName: string | undefined,
  chainMetadata: ChainMetadata | undefined,
  txHash: string | undefined,
  output: RouteOutput,
): string | undefined {
  const multiProvider = useReadyMultiProvider();
  const multiProviderVersion = useMultiProviderVersion();
  const recipientKey = output.outputRecipients
    ?.map((recipient) => recipient.toLowerCase())
    .sort()
    .join(',');
  const tokenAddress = output.type === 'token' ? output.address : output.wrappedNativeToken;

  const { data } = useQuery({
    queryKey: [
      'transactionRouteActualOutputAmount',
      chainName,
      txHash,
      output.type,
      tokenAddress?.toLowerCase(),
      recipientKey,
      multiProviderVersion,
    ],
    queryFn: () => fetchActualOutputAmount(chainName!, txHash!, output, multiProvider!),
    enabled:
      !!chainName &&
      !!chainMetadata &&
      !!txHash &&
      !!multiProvider &&
      (output.type === 'native'
        ? !!output.wrappedNativeToken
        : !!output.address && !!output.outputRecipients?.length),
    retry: false,
    staleTime: Infinity,
  });

  return data;
}

async function fetchActualOutputAmount(
  chainName: string,
  txHash: string,
  output: RouteOutput,
  multiProvider: ExplorerMultiProvider,
): Promise<string | undefined> {
  let receipt;
  try {
    const provider = multiProvider.getEthersV5Provider(chainName);
    receipt = await provider.getTransactionReceipt(txHash);
  } catch {
    return undefined;
  }
  if (!receipt) return undefined;

  if (output.type === 'native') {
    if (!output.wrappedNativeToken) return undefined;
    const wrappedNativeToken = output.wrappedNativeToken.toLowerCase();
    const withdrawalLogs = receipt.logs.filter(
      (log) =>
        log.address.toLowerCase() === wrappedNativeToken &&
        log.topics[0]?.toLowerCase() === WETH_WITHDRAWAL_TOPIC,
    );
    return withdrawalLogs.length === 1
      ? BigNumber.from(withdrawalLogs[0].data).toString()
      : undefined;
  }

  if (!output.address || !output.outputRecipients?.length) return undefined;

  const outputTokenAddress = output.address.toLowerCase();
  const recipients = new Set(output.outputRecipients.map((recipient) => recipient.toLowerCase()));
  let amount = BigNumber.from(0);

  for (const log of receipt.logs) {
    if (
      log.address.toLowerCase() !== outputTokenAddress ||
      log.topics[0]?.toLowerCase() !== ERC20_TRANSFER_TOPIC
    ) {
      continue;
    }

    const recipient = topicToAddress(log.topics[2]);
    if (!recipient || !recipients.has(recipient)) continue;
    amount = amount.add(BigNumber.from(log.data));
  }

  return amount.isZero() ? undefined : amount.toString();
}

function topicToAddress(topic: string | undefined): string | undefined {
  if (!topic || topic.length < 42) return undefined;
  return ('0x' + topic.slice(-40)).toLowerCase();
}

function formatRawAmount(rawAmount: string | undefined, decimals: number | undefined) {
  if (!rawAmount || decimals === undefined) return undefined;
  return fromWei(rawAmount, decimals);
}

function formatOutputAmount(
  amount: string | undefined,
  symbol: string,
  kind: 'exact' | 'minimum' | undefined,
) {
  if (!amount) return undefined;
  const prefix = kind === 'minimum' ? '~' : '';
  return `${prefix}${formatAmountWithCommas(amount)} ${symbol}`;
}

function getNativeTokenArgs(chainMetadata: ChainMetadata): TokenArgs | undefined {
  const nativeStandard =
    PROTOCOL_TO_NATIVE_STANDARD[chainMetadata.protocol as keyof typeof PROTOCOL_TO_NATIVE_STANDARD];
  const nativeToken = chainMetadata.nativeToken;
  if (!nativeStandard || !nativeToken) return undefined;

  return {
    chainName: chainMetadata.name,
    standard: nativeStandard,
    addressOrDenom: nativeToken.denom || '',
    decimals: nativeToken.decimals,
    symbol: nativeToken.symbol,
    name: nativeToken.name,
    logoURI: chainMetadata.logoURI,
  };
}

function useOnchainOutputToken(
  chainName: string | undefined,
  chainMetadata: ChainMetadata | undefined,
  tokenAddress: string | undefined,
  shouldFetch: boolean,
): TokenArgs | undefined {
  const multiProvider = useReadyMultiProvider();
  const multiProviderVersion = useMultiProviderVersion();
  const standard = chainMetadata ? getFungibleTokenStandard(chainMetadata) : undefined;

  const { data } = useQuery({
    // eslint-disable-next-line @tanstack/query/exhaustive-deps
    queryKey: [
      'transactionOutputTokenMetadata',
      chainName,
      tokenAddress?.toLowerCase(),
      multiProviderVersion,
    ],
    queryFn: () =>
      fetchOnchainFungibleTokenArgs(chainName!, chainMetadata!, tokenAddress!, multiProvider!),
    enabled:
      shouldFetch &&
      !!chainName &&
      !!chainMetadata &&
      !!tokenAddress &&
      !!multiProvider &&
      !!standard,
    staleTime: Infinity,
  });

  return data;
}

function getFungibleTokenStandard(chainMetadata: ChainMetadata): TokenStandard | undefined {
  if (chainMetadata.protocol === ProtocolType.Tron) return TokenStandard.TRC20;
  if (isEVMLike(chainMetadata.protocol)) return TokenStandard.ERC20;
  return undefined;
}

async function fetchOnchainFungibleTokenArgs(
  chainName: string,
  chainMetadata: ChainMetadata,
  tokenAddress: string,
  multiProvider: ExplorerMultiProvider,
): Promise<TokenArgs | undefined> {
  const standard = getFungibleTokenStandard(chainMetadata);
  if (!standard) return undefined;

  const provider = multiProvider.getEthersV5Provider(chainName);
  const stringContract = new Contract(tokenAddress, TOKEN_METADATA_STRING_ABI, provider);
  const bytes32Contract = new Contract(tokenAddress, TOKEN_METADATA_BYTES32_ABI, provider);
  const [symbol, name, decimals] = await Promise.all([
    readTokenString(stringContract, bytes32Contract, 'symbol'),
    readTokenString(stringContract, bytes32Contract, 'name'),
    readTokenDecimals(stringContract),
  ]);

  if (!symbol) return undefined;

  return {
    chainName,
    standard,
    addressOrDenom: tokenAddress,
    decimals: decimals ?? 18,
    symbol,
    name: name || symbol,
  };
}

async function readTokenString(
  stringContract: Contract,
  bytes32Contract: Contract,
  method: 'symbol' | 'name',
): Promise<string | undefined> {
  try {
    const value = await stringContract[method]();
    if (typeof value === 'string' && value) return value;
  } catch {
    // Try bytes32 metadata below.
  }

  try {
    const value = await bytes32Contract[method]();
    const parsed = utils.parseBytes32String(value);
    return parsed || undefined;
  } catch {
    return undefined;
  }
}

async function readTokenDecimals(contract: Contract): Promise<number | undefined> {
  try {
    const value = await contract.decimals();
    return Number(value.toString());
  } catch {
    return undefined;
  }
}

const styles = {
  labelWidthSm: 'w-28 sm:w-32',
};

function NetSwapTokenLogos({
  originToken,
  outputToken,
}: {
  originToken: WarpRouteDetails['originToken'];
  outputToken: WarpRouteDetails['destinationToken'] | undefined;
}) {
  if (!outputToken) {
    return (
      <div className="flex shrink-0 items-center justify-center">
        <TokenIcon token={originToken} size={64} />
      </div>
    );
  }

  return (
    <div className="flex shrink-0 items-center justify-center">
      <div className="relative" style={{ width: 64, height: 64 }}>
        <div className="absolute left-0 top-0">
          <TokenIcon token={originToken} size={42} />
        </div>
        <div className="absolute bottom-0 right-0">
          <TokenIcon token={outputToken} size={42} />
        </div>
      </div>
    </div>
  );
}
