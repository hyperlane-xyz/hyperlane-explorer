import { fromWei, shortenAddress } from '@hyperlane-xyz/utils';
import { BoxArrowIcon, CopyButton } from '@hyperlane-xyz/widgets';
import clsx from 'clsx';
import { useEffect, useState } from 'react';

import { ChainLogo } from '../../../components/icons/ChainLogo';
import { useMultiProvider } from '../../../store';
import { formatAmountCompact } from '../../../utils/amount';
import { tryGetBlockExplorerAddressUrl } from '../../../utils/url';

import { ChainBalance, WarpRouteTokenVisualization } from './types';
import { isCollateralTokenStandard } from './useWarpRouteVisualization';

interface WarpRouteGraphProps {
  tokens: WarpRouteTokenVisualization[];
  originChain: string;
  destinationChain: string;
  balances: Record<string, ChainBalance>;
  transferAmount?: bigint;
  transferAmountDisplay?: string;
  tokenSymbol?: string;
}

// Color coding for token standards
function getTokenTypeColor(standard: string | undefined): string {
  if (!standard) return 'bg-gray-100 text-gray-700 border-gray-300';

  if (standard.includes('Synthetic')) return 'bg-purple-100 text-purple-700 border-purple-300';
  if (standard.includes('Collateral') || standard.includes('Lockbox'))
    return 'bg-primary-25 text-primary-700 border-primary-200';
  if (standard.includes('Native')) return 'bg-orange-100 text-orange-700 border-orange-300';
  if (standard.includes('XERC20')) return 'bg-blue-50 text-blue-700 border-blue-200';

  return 'bg-gray-100 text-gray-700 border-gray-300';
}

function getTokenTypeLabel(standard: string | undefined): string {
  if (!standard) return 'Unknown';

  if (standard.includes('Synthetic')) return 'Synthetic';
  if (standard.includes('Collateral')) return 'Collateral';
  if (standard.includes('Native')) return 'Native';
  if (standard.includes('XERC20')) return 'xERC20';
  if (standard.includes('Lockbox')) return 'Lockbox';

  // Strip protocol prefix (Evm, Sealevel, Cw, Cosmos, Starknet)
  return standard.replace(/^(Evm|Sealevel|Cw|Cosmos|Starknet)Hyp/, '');
}

function isCollateralToken(token: WarpRouteTokenVisualization): boolean {
  return token.standard ? isCollateralTokenStandard(token.standard) : false;
}

function isSyntheticToken(token: WarpRouteTokenVisualization): boolean {
  return token.standard ? token.standard.includes('Synthetic') : false;
}

function isXERC20Token(token: WarpRouteTokenVisualization): boolean {
  return token.standard ? token.standard.includes('XERC20') : false;
}

/**
 * Format a balance in a compact form using the shared utility
 */
function formatBalance(balance: bigint, decimals: number): string {
  const value = fromWei(balance.toString(), decimals);
  return formatAmountCompact(value);
}

/**
 * Compact node component for origin/destination
 */
function CompactChainNode({
  token,
  chainBalance,
  transferAmount,
  borderColor,
  multiProvider,
  explorerUrls,
  isDestination = false,
}: {
  token: WarpRouteTokenVisualization | undefined;
  chainBalance: ChainBalance | undefined;
  transferAmount: bigint | undefined;
  borderColor: string;
  multiProvider: ReturnType<typeof useMultiProvider>;
  explorerUrls: Record<string, string | null>;
  isDestination?: boolean;
}) {
  if (!token) return null;

  const isCollateral = isCollateralToken(token);
  const isSynthetic = isSyntheticToken(token);
  const isXERC20 = isXERC20Token(token);
  const balance = chainBalance?.balance;

  // Only mark as insufficient if this is the destination chain
  const hasInsufficientBalance =
    isDestination &&
    isCollateral &&
    balance !== undefined &&
    transferAmount !== undefined &&
    balance < transferAmount;

  const explorerUrl = explorerUrls[`${token.chainName}:${token.addressOrDenom}`];

  // Get display name from multiProvider if available
  const chainMetadata = multiProvider.tryGetChainMetadata(token.chainName);
  const displayName = chainMetadata?.displayName || token.chainName;

  return (
    <div
      className={clsx(
        'flex w-[140px] flex-col items-center rounded-lg border-2 bg-white p-2 shadow-sm',
        borderColor,
        hasInsufficientBalance && 'bg-red-50',
      )}
    >
      <ChainLogo chainName={token.chainName} size={24} />
      <span className="mt-1 text-center text-xs font-semibold">{displayName}</span>

      {/* Token type badge */}
      <span
        className={`mt-1 rounded border px-1.5 py-0.5 text-[9px] font-medium ${getTokenTypeColor(token.standard)}`}
      >
        {getTokenTypeLabel(token.standard)}
      </span>

      {/* Token address with link */}
      <div className="mt-1 flex items-center gap-0.5">
        <span className="font-mono text-[9px] text-gray-500">
          {shortenAddress(token.addressOrDenom)}
        </span>
        <CopyButton
          copyValue={token.addressOrDenom}
          width={10}
          height={10}
          className="opacity-50"
        />
        {explorerUrl && (
          <a
            href={explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="opacity-50 hover:opacity-100"
          >
            <BoxArrowIcon width={10} height={10} />
          </a>
        )}
      </div>

      {/* Balance/Supply for collateral/synthetic */}
      {balance !== undefined && (isCollateral || isSynthetic) && !isXERC20 && (
        <div
          className={`mt-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${
            hasInsufficientBalance
              ? 'bg-red-100 text-red-700'
              : isSynthetic
                ? 'bg-purple-100 text-purple-700'
                : 'bg-gray-100 text-gray-700'
          }`}
        >
          {formatBalance(balance, token.decimals)} {token.symbol}
          {isSynthetic && <span className="ml-1 text-[8px]">(supply)</span>}
        </div>
      )}

      {/* xERC20 display: total supply + lockbox if applicable */}
      {isXERC20 && !!chainBalance && (
        <div className="mt-1 flex flex-col items-center gap-0.5">
          {chainBalance.xerc20Supply !== undefined && (
            <div className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
              {formatBalance(chainBalance.xerc20Supply, token.decimals)} {token.symbol}
              <span className="ml-1 text-[8px]">(supply)</span>
            </div>
          )}
          {chainBalance.lockboxBalance !== undefined && (
            <div className="rounded bg-primary-25 px-1.5 py-0.5 text-[10px] font-medium text-primary-700">
              {formatBalance(chainBalance.lockboxBalance, token.decimals)} {token.symbol}
              <span className="ml-1 text-[8px]">(lockbox)</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Minimal chain node for other chains - shows balance info
 */
function MinimalChainNode({
  token,
  chainBalance,
  multiProvider,
}: {
  token: WarpRouteTokenVisualization;
  chainBalance: ChainBalance | undefined;
  multiProvider: ReturnType<typeof useMultiProvider>;
}) {
  const chainMetadata = multiProvider.tryGetChainMetadata(token.chainName);
  const displayName = chainMetadata?.displayName || token.chainName;

  const isCollateral = isCollateralToken(token);
  const isSynthetic = isSyntheticToken(token);
  const isXERC20 = isXERC20Token(token);
  const balance = chainBalance?.balance;

  return (
    <div className="flex w-[90px] flex-col items-center rounded-lg border border-gray-200 bg-white p-1.5 shadow-sm">
      <ChainLogo chainName={token.chainName} size={20} />
      <span className="mt-0.5 text-center text-[9px] font-medium">{displayName}</span>
      <span
        className={`mt-0.5 rounded border px-1 py-0.5 text-[7px] font-medium ${getTokenTypeColor(token.standard)}`}
      >
        {getTokenTypeLabel(token.standard)}
      </span>

      {/* Balance for collateral/synthetic (non-xERC20) */}
      {balance !== undefined && (isCollateral || isSynthetic) && !isXERC20 && (
        <div
          className={`mt-0.5 rounded px-1 py-0.5 text-[8px] font-medium ${
            isSynthetic ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-700'
          }`}
        >
          {formatBalance(balance, token.decimals)}
        </div>
      )}

      {/* xERC20 display */}
      {isXERC20 && !!chainBalance && (
        <div className="mt-0.5 flex flex-col items-center gap-0.5">
          {chainBalance.xerc20Supply !== undefined && (
            <div className="rounded bg-blue-50 px-1 py-0.5 text-[8px] font-medium text-blue-700">
              {formatBalance(chainBalance.xerc20Supply, token.decimals)}
            </div>
          )}
          {chainBalance.lockboxBalance !== undefined && (
            <div className="rounded bg-primary-25 px-1 py-0.5 text-[8px] font-medium text-primary-700">
              {formatBalance(chainBalance.lockboxBalance, token.decimals)}
              <span className="ml-0.5 text-[6px]">lbx</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function WarpRouteGraph({
  tokens,
  originChain,
  destinationChain,
  balances,
  transferAmount,
  transferAmountDisplay,
  tokenSymbol,
}: WarpRouteGraphProps) {
  const multiProvider = useMultiProvider();
  const [explorerUrls, setExplorerUrls] = useState<Record<string, string | null>>({});

  // Fetch explorer URLs for all tokens
  useEffect(() => {
    const fetchExplorerUrls = async () => {
      const urls: Record<string, string | null> = {};
      const fetchTasks: { key: string; promise: Promise<string | null> }[] = [];

      for (const token of tokens) {
        const tokenKey = `${token.chainName}:${token.addressOrDenom}`;
        fetchTasks.push({
          key: tokenKey,
          promise: tryGetBlockExplorerAddressUrl(
            multiProvider,
            token.chainName,
            token.addressOrDenom,
          ),
        });
      }

      const results = await Promise.allSettled(fetchTasks.map((t) => t.promise));
      results.forEach((result, i) => {
        const key = fetchTasks[i].key;
        urls[key] = result.status === 'fulfilled' ? result.value : null;
      });

      setExplorerUrls(urls);
    };

    if (tokens.length > 0) {
      fetchExplorerUrls();
    }
  }, [tokens, multiProvider]);

  // Get origin and destination tokens
  const originToken = tokens.find((t) => t.chainName === originChain);
  const destToken = tokens.find((t) => t.chainName === destinationChain);
  const otherTokens = tokens.filter(
    (t) => t.chainName !== originChain && t.chainName !== destinationChain,
  );

  if (tokens.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-gray-500">
        No tokens in warp route
      </div>
    );
  }

  const originBalance = originToken ? balances[originToken.chainName] : undefined;
  const destBalance = destToken ? balances[destToken.chainName] : undefined;

  return (
    <div className="relative flex flex-col items-center gap-4 py-4">
      {/* Main transfer visualization - origin and destination */}
      <div className="flex items-center gap-4">
        {/* Origin */}
        <CompactChainNode
          token={originToken}
          chainBalance={originBalance}
          transferAmount={transferAmount}
          borderColor="border-primary-500"
          multiProvider={multiProvider}
          explorerUrls={explorerUrls}
        />

        {/* Arrow with transfer amount */}
        <div className="flex flex-col items-center">
          <div className="flex items-center">
            <div className="h-0.5 w-8 bg-primary-500" />
            {transferAmountDisplay && tokenSymbol && (
              <div className="rounded border border-primary-500 bg-white px-2 py-1">
                <span className="text-xs font-medium text-primary-600">
                  {transferAmountDisplay} {tokenSymbol}
                </span>
              </div>
            )}
            <div className="h-0.5 w-8 bg-primary-500" />
            <div className="h-0 w-0 border-b-[6px] border-l-[8px] border-t-[6px] border-b-transparent border-l-primary-500 border-t-transparent" />
          </div>
        </div>

        {/* Destination */}
        <CompactChainNode
          token={destToken}
          chainBalance={destBalance}
          transferAmount={transferAmount}
          borderColor="border-primary-500"
          multiProvider={multiProvider}
          explorerUrls={explorerUrls}
          isDestination={true}
        />
      </div>

      {/* Other chains in a compact grid */}
      {otherTokens.length > 0 && (
        <div className="flex flex-col items-center gap-2">
          <div className="text-[10px] text-gray-500">Other connected chains:</div>
          <div className="flex flex-wrap justify-center gap-2">
            {otherTokens.map((token) => (
              <MinimalChainNode
                key={token.chainName}
                token={token}
                chainBalance={balances[token.chainName]}
                multiProvider={multiProvider}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
