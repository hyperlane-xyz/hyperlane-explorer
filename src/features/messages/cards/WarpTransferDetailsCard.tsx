import type { TokenArgs } from '@hyperlane-xyz/sdk';
import { ERC4626_COLLATERAL_STANDARDS } from '@hyperlane-xyz/sdk/token/TokenStandard';
import { isValidAddress, ProtocolType } from '@hyperlane-xyz/utils';
import { ArrowIcon, ChevronIcon, CopyButton, RefreshIcon, Tooltip } from '@hyperlane-xyz/widgets';
import BigNumber from 'bignumber.js';
import clsx from 'clsx';
import { useMemo } from 'react';

import { ChainLogo } from '../../../components/icons/ChainLogo';
import { TokenIcon } from '../../../components/icons/TokenIcon';
import { SectionCard } from '../../../components/layout/SectionCard';
import { useChainMetadataResolver, useRegistry } from '../../../metadataStore';
import {
  MessageStatus,
  type Message,
  type MessageStub,
  type WarpRouteDetails,
} from '../../../types';
import { formatAmountCompact } from '../../../utils/amount';
import { truncateString } from '../../../utils/string';
import { getBlockExplorerAddressUrl } from '../../../utils/url';
import { getChainDisplayName } from '../../chains/utils';
import { getWarpTokenBalanceKind, getWarpTokenBehavior } from '../warpVisualization/tokenStandards';
import { getWarpRouteTokenKey, type ChainBalance } from '../warpVisualization/types';
import { useWarpRouteBalances } from '../warpVisualization/useWarpRouteBalances';
import { useWarpRouteConfig } from '../warpVisualization/useWarpRouteVisualization';
import { formatUsd } from './gasPaymentSummary';
import { useTokenUsdPrices } from './useNativeTokenUsdPrice';
import { WarpFeeDetails } from './WarpFeeDetails';

interface Props {
  message: Message | MessageStub;
  warpRouteDetails: WarpRouteDetails | undefined;
  blur: boolean;
}

export function WarpTransferDetails({ message, warpRouteDetails, blur }: Props) {
  const registry = useRegistry();
  const warpRoute = useWarpRouteConfig(warpRouteDetails);
  const balanceTokens = useMemo(
    () =>
      warpRouteDetails
        ? [warpRouteDetails.originToken, warpRouteDetails.destinationToken]
            .filter((token) => getWarpTokenBalanceKind(token.standard))
            .map((token) => ({
              chainName: token.chainName,
              addressOrDenom: token.addressOrDenom,
              symbol: token.symbol,
              decimals: token.decimals,
              standard: token.standard,
              collateralAddressOrDenom: token.collateralAddressOrDenom,
              enrollments: [],
            }))
        : [],
    [warpRouteDetails],
  );
  const { balances, isLoading, isFetching, refetch } = useWarpRouteBalances(
    balanceTokens,
    warpRoute?.routeId,
    undefined,
    !blur,
  );

  if (!warpRouteDetails) return null;

  const { transferRecipient, wireAmount, originToken, destinationToken, amount, destAmount } =
    warpRouteDetails;
  const delivered = message.status === MessageStatus.Delivered;
  const differentAssets =
    originToken.symbol !== destinationToken.symbol ||
    originToken.logoURI !== destinationToken.logoURI;

  return (
    <div className="space-y-5">
      <div
        className="grid min-w-0 gap-4 sm:grid-cols-[minmax(0,1fr)_3.5rem_minmax(0,1fr)] sm:gap-y-3"
        aria-label="Warp token flow"
      >
        {warpRoute && (
          <div className="flex min-w-0 flex-wrap items-center justify-end gap-x-2 gap-y-1 self-start sm:col-start-3 sm:row-start-1">
            <span className="text-xs text-gray-500">Warp route</span>
            <a
              href={registry
                .getUri(`deployments/warp_routes/${warpRoute.routeId}-config.yaml`)
                .replace(
                  /^https:\/\/raw\.githubusercontent\.com\/([^/]+\/[^/]+)\//,
                  'https://github.com/$1/blob/',
                )}
              target="_blank"
              rel="noopener noreferrer"
              title="View route config on GitHub"
              className="break-all text-xs font-medium text-primary-700 underline decoration-primary-200 underline-offset-4"
            >
              {warpRoute.routeId} ↗
            </a>
          </div>
        )}
        {!blur && message.origin.from && (
          <div className="flex min-w-0 flex-col items-center gap-2 sm:col-start-1 sm:row-start-1">
            <FlowAccount
              label="Sender"
              title="Origin transaction sender; may be an intermediary."
              address={message.origin.from}
              domainId={message.originDomainId}
              blur={blur}
            />
            <ChevronIcon
              direction="s"
              width={12}
              height={12}
              color="currentColor"
              className="text-gray-400"
              aria-hidden="true"
            />
          </div>
        )}
        <div className="min-w-0 sm:col-start-1 sm:row-start-2">
          <WarpEndpoint
            token={originToken}
            amount={amount}
            balance={
              balances[
                getWarpRouteTokenKey({
                  chainName: originToken.chainName,
                  addressOrDenom: originToken.addressOrDenom,
                })
              ]
            }
            loading={isLoading}
            blur={blur}
          />
        </div>
        <div className="flex items-center justify-center gap-2 py-1 text-gray-400 sm:col-start-2 sm:row-start-2 sm:flex-col">
          <div
            className={clsx('relative shrink-0', differentAssets ? 'h-11 w-11' : 'h-8 w-8')}
            title={
              differentAssets
                ? `${originToken.symbol} → ${destinationToken.symbol}`
                : originToken.symbol
            }
          >
            <div className="absolute left-0 top-0 overflow-hidden rounded-full bg-white ring-2 ring-white">
              <TokenIcon
                key={`${originToken.chainName}:${originToken.addressOrDenom}`}
                token={originToken}
                size={32}
              />
            </div>
            {differentAssets && (
              <div className="absolute bottom-0 right-0 overflow-hidden rounded-full bg-white ring-2 ring-white">
                <TokenIcon
                  key={`${destinationToken.chainName}:${destinationToken.addressOrDenom}`}
                  token={destinationToken}
                  size={32}
                />
              </div>
            )}
          </div>
          <div className="rotate-90 sm:rotate-0" aria-hidden="true">
            <ArrowIcon direction="e" width={32} height={32} color="currentColor" />
          </div>
        </div>
        <div className="min-w-0 sm:col-start-3 sm:row-start-2">
          <WarpEndpoint
            token={destinationToken}
            amount={destAmount ?? amount}
            destination
            delivered={delivered}
            balance={
              balances[
                getWarpRouteTokenKey({
                  chainName: destinationToken.chainName,
                  addressOrDenom: destinationToken.addressOrDenom,
                })
              ]
            }
            loading={isLoading}
            blur={blur}
          />
        </div>
        <div className="flex min-w-0 flex-col items-center gap-2 sm:col-start-3 sm:row-start-3">
          <ChevronIcon
            direction="s"
            width={12}
            height={12}
            color="currentColor"
            className="text-gray-400"
            aria-hidden="true"
          />
          <FlowAccount
            label="Recipient"
            address={transferRecipient}
            domainId={message.destinationDomainId}
            blur={blur}
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xxs text-gray-500">
        <p>Latest available balances, not balances at transfer time.</p>
        {!!warpRoute && balanceTokens.length > 0 && (
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching || blur}
            className="flex items-center gap-1.5 rounded px-1 py-1 hover:text-gray-800 disabled:opacity-50"
          >
            <RefreshIcon width={12} height={12} /> {isFetching ? 'Refreshing…' : 'Refresh balances'}
          </button>
        )}
      </div>
      <div className="min-w-0 border-t border-gray-200 pt-3">
        <p className="text-xs text-gray-500">Payload amount (raw units)</p>
        <div className="mt-1 flex items-start gap-2">
          <code className={`min-w-0 break-all text-sm text-gray-800 ${blur ? 'blur-xs' : ''}`}>
            {wireAmount}
          </code>
          <CopyButton
            copyValue={wireAmount}
            aria-label="Copy payload amount in raw units"
            width={12}
            height={12}
            className="mt-1 shrink-0 text-gray-500 [&_rect]:stroke-current [&_path]:fill-current"
          />
        </div>
      </div>
      <WarpFeeDetails message={message} warpRouteDetails={warpRouteDetails} blur={blur} />
    </div>
  );
}

function WarpEndpoint({
  token,
  amount,
  destination = false,
  delivered = false,
  balance,
  loading,
  blur,
}: {
  token: TokenArgs;
  amount: string;
  destination?: boolean;
  delivered?: boolean;
  balance?: ChainBalance;
  loading: boolean;
  blur: boolean;
}) {
  const resolver = useChainMetadataResolver();
  const metadata = resolver.tryGetChainMetadata(token.chainName);
  const behavior = getWarpTokenBehavior(token.standard);
  const balanceKind = getWarpTokenBalanceKind(token.standard);
  const prices = useTokenUsdPrices(
    token.coinGeckoId && balanceKind && !blur ? [token.coinGeckoId] : [],
    !!metadata?.isTestnet,
  );
  const balanceLabel =
    balanceKind === 'supply'
      ? 'Current token supply'
      : balanceKind === 'lockbox'
        ? 'Current lockbox balance'
        : 'Current collateral';
  const balanceAmount =
    balanceKind && balance
      ? new BigNumber(balance.balance.toString()).shiftedBy(-token.decimals).toFixed()
      : undefined;
  const price = token.coinGeckoId ? prices[token.coinGeckoId] : undefined;
  const usdValue =
    balanceAmount !== undefined &&
    !metadata?.isTestnet &&
    price != null &&
    Number.isFinite(price) &&
    price >= 0
      ? new BigNumber(balanceAmount).times(price)
      : undefined;
  const usdDisplay = usdValue?.isFinite() ? formatUsd(usdValue) : undefined;
  const action = destination ? behavior.receive : behavior.send;
  const sign = balanceKind ? (action === 'Lock' || action === 'Mint' ? '+' : '−') : '';
  const chainName = getChainDisplayName(resolver, token.chainName);
  const tokenAddress = token.collateralAddressOrDenom ?? token.addressOrDenom;
  const isCosmos =
    metadata?.protocol === ProtocolType.Cosmos || metadata?.protocol === ProtocolType.CosmosNative;
  // Native, lockbox and vault metadata do not identify the underlying token contract.
  const tokenUrl =
    behavior.type === 'Native' ||
    behavior.type === 'Lockbox' ||
    ERC4626_COLLATERAL_STANDARDS.includes(token.standard) ||
    (isCosmos && !isValidAddress(tokenAddress, metadata.protocol))
      ? null
      : getBlockExplorerAddressUrl(resolver, token.chainName, tokenAddress);
  const routerUrl =
    isCosmos && !isValidAddress(token.addressOrDenom, metadata.protocol)
      ? null
      : getBlockExplorerAddressUrl(resolver, token.chainName, token.addressOrDenom);

  return (
    <div
      className={clsx(
        'flex h-full min-w-0 flex-col overflow-hidden rounded-xl border border-gray-200',
        blur && 'blur-xs',
      )}
    >
      <div className="border-b border-gray-200 bg-gray-150/60 px-4 py-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs">
          <ChainLogo chainName={token.chainName} size={20} />
          <span className="font-medium text-gray-800">{chainName}</span>
          <span
            className="ml-auto rounded border border-gray-200 bg-white px-1.5 py-0.5 text-xxs text-gray-500"
            title={token.standard}
          >
            {behavior.type}
          </span>
        </div>
        <div className="mt-1.5 text-xxs text-gray-500" title={token.addressOrDenom}>
          Router{' '}
          {routerUrl ? (
            <a
              href={routerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline decoration-gray-300 underline-offset-4 hover:text-primary-700"
            >
              {truncateString(token.addressOrDenom, 8, 6)} ↗
            </a>
          ) : (
            truncateString(token.addressOrDenom, 8, 6)
          )}
        </div>
      </div>
      <div className="grow bg-white px-4 py-4">
        <p className="text-xxs text-gray-500">{balanceKind ? balanceLabel : 'Current balance'}</p>
        <p
          className="mt-1 text-lg font-medium text-gray-800 [overflow-wrap:anywhere]"
          title={balanceAmount === undefined ? undefined : `${balanceAmount} ${token.symbol}`}
        >
          {balanceAmount !== undefined ? (
            <>
              {formatAmountCompact(balanceAmount)}{' '}
              <span className="text-sm font-normal text-gray-500">{token.symbol}</span>
              {usdDisplay && (
                <>
                  {' '}
                  <span
                    className="inline-block max-w-full align-baseline text-xs font-normal leading-5 text-gray-500"
                    title="Approximate USD value of the latest balance using the current token price."
                  >
                    ({usdDisplay})
                  </span>
                </>
              )}
            </>
          ) : (
            <span className="text-sm font-normal text-gray-500">
              {balanceKind && loading ? 'Loading…' : 'Unavailable'}
            </span>
          )}
        </p>
      </div>
      <div
        className={clsx(
          'border-t border-gray-200 px-4 py-3',
          sign === '+' ? 'bg-green-25/40' : sign === '−' ? 'bg-red-100/15' : 'bg-gray-50/50',
        )}
      >
        <div className="mb-1 flex flex-wrap items-center justify-between gap-1 text-xxs text-gray-500">
          <span>{balanceKind ? 'This transfer' : 'Decoded amount'}</span>
          {balanceKind && (
            <span>
              {action}
              {destination && !delivered ? ' on delivery' : ''}
            </span>
          )}
        </div>
        <p
          className={clsx(
            'text-sm font-medium leading-5 [overflow-wrap:anywhere]',
            sign === '+' ? 'text-green-600' : sign === '−' ? 'text-red-600' : 'text-gray-700',
          )}
          title="Transfer principal inferred from the payload and route type; excludes fees. This is not a measured change in the current balance."
        >
          {sign}
          {new BigNumber(amount).toFormat()}{' '}
          {tokenUrl ? (
            <a
              href={tokenUrl}
              target="_blank"
              rel="noopener noreferrer"
              title={`View token: ${tokenAddress}`}
              className="underline decoration-current/30 underline-offset-4 hover:decoration-current"
            >
              {token.symbol} ↗
            </a>
          ) : (
            <span>{token.symbol}</span>
          )}
        </p>
      </div>
    </div>
  );
}

function FlowAccount({
  label,
  title,
  address,
  domainId,
  blur,
}: {
  label: string;
  title?: string;
  address?: string;
  domainId: number;
  blur: boolean;
}) {
  const resolver = useChainMetadataResolver();
  const url = address ? getBlockExplorerAddressUrl(resolver, domainId, address) : null;
  return (
    <div className="min-w-0 max-w-full text-center">
      <p className="mb-1 text-xxs text-gray-500" title={title}>
        {label}
      </p>
      <div className={clsx('flex items-start justify-center gap-1.5 text-xs', blur && 'blur-xs')}>
        {url ? (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="min-w-0 break-all text-primary-700 underline decoration-primary-200 underline-offset-4"
          >
            {address} ↗
          </a>
        ) : (
          <span className="min-w-0 break-all text-gray-600">{address ?? 'Not reported'}</span>
        )}
        {address && (
          <CopyButton
            copyValue={address}
            aria-label={`Copy ${label.toLowerCase()}`}
            width={12}
            height={12}
            className="mt-0.5 shrink-0 opacity-60"
          />
        )}
      </div>
    </div>
  );
}

export function WarpTransferDetailsCard(props: Props) {
  if (!props.warpRouteDetails) return null;
  return (
    <SectionCard
      className="w-full"
      title="Warp Transfer Details"
      icon={
        <Tooltip
          id="warp-route-info"
          content="Information about the warp route transfer such as the end recipient and amount transferred"
        />
      }
    >
      <WarpTransferDetails {...props} />
    </SectionCard>
  );
}
