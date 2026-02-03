import { fromWei, shortenAddress } from '@hyperlane-xyz/utils';
import { BoxArrowIcon, CopyButton } from '@hyperlane-xyz/widgets';
import clsx from 'clsx';
import { useEffect, useMemo, useState } from 'react';

import { ChainLogo } from '../../../components/icons/ChainLogo';
import { useMultiProvider } from '../../../store';
import { formatAmountCompact } from '../../../utils/amount';
import { tryGetBlockExplorerAddressUrl } from '../../../utils/url';

import { WarpRouteTokenVisualization } from './types';
import { isCollateralTokenStandard } from './useWarpRouteVisualization';

// Routes with more than this many chains will be collapsed by default
const COLLAPSE_THRESHOLD = 6;

interface WarpRouteGraphProps {
  tokens: WarpRouteTokenVisualization[];
  originChain: string;
  destinationChain: string;
  balances: Record<string, bigint>;
  transferAmount?: bigint;
  transferAmountDisplay?: string;
  tokenSymbol?: string;
}

interface NodePosition {
  x: number;
  y: number;
  token: WarpRouteTokenVisualization;
}

// Color coding for token standards
function getTokenTypeColor(standard: string | undefined): string {
  if (!standard) return 'bg-gray-100 text-gray-700 border-gray-300';

  if (standard.includes('Synthetic')) return 'bg-purple-100 text-purple-700 border-purple-300';
  if (standard.includes('Collateral') || standard.includes('Lockbox'))
    return 'bg-blue-100 text-blue-700 border-blue-300';
  if (standard.includes('Native')) return 'bg-orange-100 text-orange-700 border-orange-300';
  if (standard.includes('XERC20')) return 'bg-indigo-100 text-indigo-700 border-indigo-300';

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

/**
 * Format a balance in a compact form using the shared utility
 */
function formatBalance(balance: bigint, decimals: number): string {
  const value = fromWei(balance.toString(), decimals);
  return formatAmountCompact(value);
}

/**
 * Compact node component for collapsed view
 */
function CompactChainNode({
  token,
  balance,
  transferAmount,
  borderColor,
  multiProvider,
  explorerUrls,
  isDestination = false,
}: {
  token: WarpRouteTokenVisualization | undefined;
  balance: bigint | undefined;
  transferAmount: bigint | undefined;
  borderColor: string;
  multiProvider: ReturnType<typeof useMultiProvider>;
  explorerUrls: Record<string, string | null>;
  isDestination?: boolean;
}) {
  if (!token) return null;

  const isCollateral = isCollateralToken(token);
  const isSynthetic = isSyntheticToken(token);
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

      {/* Balance/Supply */}
      {balance !== undefined && (isCollateral || isSynthetic) && (
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
    </div>
  );
}

/**
 * Minimal chain node - just logo, name, and type badge
 */
function MinimalChainNode({
  token,
  multiProvider,
}: {
  token: WarpRouteTokenVisualization;
  multiProvider: ReturnType<typeof useMultiProvider>;
}) {
  const chainMetadata = multiProvider.tryGetChainMetadata(token.chainName);
  const displayName = chainMetadata?.displayName || token.chainName;

  return (
    <div className="flex w-[80px] flex-col items-center rounded-lg border border-gray-200 bg-white p-1.5 shadow-sm">
      <ChainLogo chainName={token.chainName} size={20} />
      <span className="mt-0.5 text-center text-[9px] font-medium">{displayName}</span>
      <span
        className={`mt-0.5 rounded border px-1 py-0.5 text-[7px] font-medium ${getTokenTypeColor(token.standard)}`}
      >
        {getTokenTypeLabel(token.standard)}
      </span>
    </div>
  );
}

/**
 * Collapsed view for routes with many chains - shows all chains but with minimal detail
 */
function CollapsedRouteView({
  tokens,
  originToken,
  destToken,
  balances,
  transferAmount,
  transferAmountDisplay,
  tokenSymbol,
  multiProvider,
  explorerUrls,
  onExpand,
}: {
  tokens: WarpRouteTokenVisualization[];
  originToken: WarpRouteTokenVisualization | undefined;
  destToken: WarpRouteTokenVisualization | undefined;
  balances: Record<string, bigint>;
  transferAmount: bigint | undefined;
  transferAmountDisplay: string | undefined;
  tokenSymbol: string | undefined;
  multiProvider: ReturnType<typeof useMultiProvider>;
  explorerUrls: Record<string, string | null>;
  onExpand: () => void;
}) {
  const originBalance = originToken ? balances[originToken.chainName] : undefined;
  const destBalance = destToken ? balances[destToken.chainName] : undefined;
  const otherTokens = tokens.filter(
    (t) => t.chainName !== originToken?.chainName && t.chainName !== destToken?.chainName,
  );

  return (
    <div className="relative flex flex-col items-center gap-4 py-4">
      {/* Expand button */}
      <button
        onClick={onExpand}
        className="absolute right-0 top-0 rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600 hover:bg-gray-200"
      >
        Show details
      </button>

      {/* Main transfer visualization - origin and destination with full details */}
      <div className="flex items-center gap-4">
        {/* Origin */}
        <CompactChainNode
          token={originToken}
          balance={originBalance}
          transferAmount={transferAmount}
          borderColor="border-blue-500"
          multiProvider={multiProvider}
          explorerUrls={explorerUrls}
        />

        {/* Arrow with transfer amount */}
        <div className="flex flex-col items-center">
          <div className="flex items-center">
            <div className="h-0.5 w-8 bg-blue-500" />
            <div className="rounded border border-blue-500 bg-white px-2 py-1">
              <span className="text-xs font-medium text-blue-600">
                {transferAmountDisplay} {tokenSymbol}
              </span>
            </div>
            <div className="h-0.5 w-8 bg-blue-500" />
            <div className="h-0 w-0 border-b-[6px] border-l-[8px] border-t-[6px] border-b-transparent border-l-blue-500 border-t-transparent" />
          </div>
        </div>

        {/* Destination */}
        <CompactChainNode
          token={destToken}
          balance={destBalance}
          transferAmount={transferAmount}
          borderColor="border-blue-500"
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
              <MinimalChainNode key={token.chainName} token={token} multiProvider={multiProvider} />
            ))}
          </div>
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

  // For routes with many chains, collapse by default
  const shouldCollapseByDefault = tokens.length > COLLAPSE_THRESHOLD;
  const [isExpanded, setIsExpanded] = useState(!shouldCollapseByDefault);
  const [hasUserToggled, setHasUserToggled] = useState(false);
  const [explorerUrls, setExplorerUrls] = useState<Record<string, string | null>>({});

  // Sync expanded state when tokens load asynchronously (unless user has manually toggled)
  useEffect(() => {
    if (!hasUserToggled) {
      setIsExpanded(!shouldCollapseByDefault);
    }
  }, [hasUserToggled, shouldCollapseByDefault]);

  // Fetch explorer URLs for all tokens
  useEffect(() => {
    const fetchExplorerUrls = async () => {
      const urls: Record<string, string | null> = {};
      const fetchTasks: { key: string; promise: Promise<string | null> }[] = [];

      for (const token of tokens) {
        // Fetch URL for token address
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

      // Use Promise.allSettled to handle failures gracefully
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

  // Find origin and destination indices
  const originIndex = tokens.findIndex((t) => t.chainName === originChain);
  const destIndex = tokens.findIndex((t) => t.chainName === destinationChain);

  // Calculate node positions - place origin and destination on a horizontal line
  const nodePositions = useMemo((): NodePosition[] => {
    if (tokens.length === 0) return [];

    const centerX = 200;
    const centerY = 200;
    const horizontalY = 200; // Y position for origin and destination (horizontal line)
    const radius = 130;

    // Separate tokens into origin, destination, and others
    const otherTokens = tokens.filter(
      (t) => t.chainName !== originChain && t.chainName !== destinationChain,
    );

    const positions: NodePosition[] = [];

    // Place origin on the left
    if (originIndex !== -1) {
      positions[originIndex] = {
        x: centerX - 120,
        y: horizontalY,
        token: tokens[originIndex],
      };
    }

    // Place destination on the right
    if (destIndex !== -1) {
      positions[destIndex] = {
        x: centerX + 120,
        y: horizontalY,
        token: tokens[destIndex],
      };
    }

    // Place other tokens in a semicircle above and below
    if (otherTokens.length > 0) {
      const otherIndices = tokens
        .map((t, i) => (t.chainName !== originChain && t.chainName !== destinationChain ? i : -1))
        .filter((i) => i !== -1);

      otherIndices.forEach((tokenIndex, i) => {
        // Distribute other nodes in semicircles above and below
        const totalOthers = otherIndices.length;
        let angle: number;

        if (totalOthers === 1) {
          // Single other token goes above
          angle = -Math.PI / 2;
        } else if (totalOthers === 2) {
          // Two others: one above, one below
          angle = i === 0 ? -Math.PI / 2 : Math.PI / 2;
        } else {
          // Multiple others: distribute in upper and lower semicircles
          const upperCount = Math.ceil(totalOthers / 2);
          if (i < upperCount) {
            // Upper semicircle
            const step = Math.PI / (upperCount + 1);
            angle = -Math.PI + step * (i + 1);
          } else {
            // Lower semicircle
            const lowerCount = totalOthers - upperCount;
            const step = Math.PI / (lowerCount + 1);
            angle = step * (i - upperCount + 1);
          }
        }

        positions[tokenIndex] = {
          x: centerX + radius * Math.cos(angle),
          y: centerY + radius * Math.sin(angle),
          token: tokens[tokenIndex],
        };
      });
    }

    return positions;
  }, [tokens, originChain, destinationChain, originIndex, destIndex]);

  // Calculate midpoint for edge label (between origin and destination)
  const edgeLabelPosition = useMemo(() => {
    if (originIndex === -1 || destIndex === -1 || originIndex === destIndex) return null;
    const from = nodePositions[originIndex];
    const to = nodePositions[destIndex];
    if (!from || !to) return null;
    return {
      x: (from.x + to.x) / 2,
      y: (from.y + to.y) / 2,
    };
  }, [nodePositions, originIndex, destIndex]);

  // Get origin and destination tokens
  const originToken = tokens.find((t) => t.chainName === originChain);
  const destToken = tokens.find((t) => t.chainName === destinationChain);

  if (tokens.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-gray-500">
        No tokens in warp route
      </div>
    );
  }

  // Render a compact collapsed view for large routes
  if (!isExpanded && shouldCollapseByDefault) {
    return (
      <CollapsedRouteView
        tokens={tokens}
        originToken={originToken}
        destToken={destToken}
        balances={balances}
        transferAmount={transferAmount}
        transferAmountDisplay={transferAmountDisplay}
        tokenSymbol={tokenSymbol}
        multiProvider={multiProvider}
        explorerUrls={explorerUrls}
        onExpand={() => {
          setHasUserToggled(true);
          setIsExpanded(true);
        }}
      />
    );
  }

  return (
    <div className="relative mx-auto w-full max-w-[500px]">
      {/* Collapse button for large routes */}
      {shouldCollapseByDefault && isExpanded && (
        <button
          onClick={() => {
            setHasUserToggled(true);
            setIsExpanded(false);
          }}
          className="absolute -top-2 right-0 z-10 rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600 hover:bg-gray-200"
        >
          Collapse
        </button>
      )}
      <svg viewBox="0 0 400 400" className="h-auto w-full">
        {/* Draw connecting lines between all nodes */}
        {nodePositions.map(
          (from, i) =>
            from &&
            nodePositions.slice(i + 1).map((to, j) => {
              if (!to) return null;
              const actualJ = i + j + 1;
              const isActivePath =
                (i === originIndex && actualJ === destIndex) ||
                (actualJ === originIndex && i === destIndex);

              return (
                <line
                  key={`${i}-${actualJ}`}
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  stroke={isActivePath ? '#3b82f6' : '#e5e7eb'}
                  strokeWidth={isActivePath ? 3 : 1.5}
                  strokeDasharray={isActivePath ? undefined : '4,4'}
                />
              );
            }),
        )}

        {/* Transfer amount label on edge (between origin and destination) */}
        {edgeLabelPosition && transferAmountDisplay && (
          <g>
            <rect
              x={edgeLabelPosition.x - 45}
              y={edgeLabelPosition.y - 12}
              width={90}
              height={24}
              rx={4}
              fill="white"
              stroke="#3b82f6"
              strokeWidth={1}
            />
            <text
              x={edgeLabelPosition.x}
              y={edgeLabelPosition.y + 4}
              textAnchor="middle"
              className="fill-blue-600 font-medium"
              style={{ fontSize: '11px' }}
            >
              {transferAmountDisplay} {tokenSymbol}
            </text>
          </g>
        )}
      </svg>

      {/* Render nodes as positioned HTML elements */}
      {nodePositions.map((node) => {
        if (!node) return null;

        const isOrigin = node.token.chainName === originChain;
        const isDestination = node.token.chainName === destinationChain;
        const isCollateral = isCollateralToken(node.token);
        const isSynthetic = isSyntheticToken(node.token);
        const balance = balances[node.token.chainName];

        // Only mark as insufficient if this is the DESTINATION chain and it's collateral
        const hasInsufficientBalance =
          isDestination &&
          isCollateral &&
          balance !== undefined &&
          transferAmount !== undefined &&
          balance < transferAmount;

        const tokenExplorerUrl =
          explorerUrls[`${node.token.chainName}:${node.token.addressOrDenom}`];

        return (
          <div
            key={node.token.chainName}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{
              left: `${(node.x / 400) * 100}%`,
              top: `${(node.y / 400) * 100}%`,
            }}
          >
            <div
              className={clsx(
                'flex min-w-[120px] flex-col items-center rounded-lg border-2 bg-white p-2 shadow-sm',
                isOrigin || isDestination
                  ? hasInsufficientBalance
                    ? 'border-red-500 bg-red-50'
                    : 'border-blue-500'
                  : 'border-gray-200',
              )}
            >
              {/* Chain logo and name */}
              <ChainLogo chainName={node.token.chainName} size={24} />
              <span className="mt-1 text-xs font-semibold">
                {multiProvider.tryGetChainMetadata(node.token.chainName)?.displayName ||
                  node.token.chainName}
              </span>

              {/* Token type badge */}
              <span
                className={`mt-1 rounded border px-1.5 py-0.5 text-[9px] font-medium ${getTokenTypeColor(node.token.standard)}`}
              >
                {getTokenTypeLabel(node.token.standard)}
              </span>

              {/* Token address with link */}
              <div className="mt-1 flex items-center gap-0.5">
                <span className="font-mono text-[9px] text-gray-500">
                  {shortenAddress(node.token.addressOrDenom)}
                </span>
                <CopyButton
                  copyValue={node.token.addressOrDenom}
                  width={10}
                  height={10}
                  className="opacity-50"
                />
                {tokenExplorerUrl && (
                  <a
                    href={tokenExplorerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="opacity-50 hover:opacity-100"
                  >
                    <BoxArrowIcon width={10} height={10} />
                  </a>
                )}
              </div>

              {/* Balance/Supply - shown for both collateral and synthetic tokens */}
              {balance !== undefined && (isCollateral || isSynthetic) && (
                <div
                  className={`mt-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                    hasInsufficientBalance
                      ? 'bg-red-100 text-red-700'
                      : isSynthetic
                        ? 'bg-purple-100 text-purple-700'
                        : 'bg-gray-100 text-gray-700'
                  }`}
                >
                  {formatBalance(balance, node.token.decimals)} {node.token.symbol}
                  {isSynthetic && <span className="ml-1 text-[8px]">(supply)</span>}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
