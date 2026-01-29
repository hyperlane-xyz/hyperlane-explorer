import { toWei } from '@hyperlane-xyz/utils';
import { ChevronIcon, CopyButton, RefreshIcon, SpinnerIcon, Tooltip } from '@hyperlane-xyz/widgets';
import clsx from 'clsx';
import Image from 'next/image';
import { useMemo, useState } from 'react';

import { Card } from '../../../components/layout/Card';
import HubIcon from '../../../images/icons/hub.svg';
import { useMultiProvider } from '../../../store';
import { Message, WarpRouteDetails } from '../../../types';
import { WarpRouteGraph } from '../warpVisualization/WarpRouteGraph';
import { useWarpRouteBalances } from '../warpVisualization/useWarpRouteBalances';
import { useWarpRouteVisualization } from '../warpVisualization/useWarpRouteVisualization';

interface Props {
  message: Message;
  warpRouteDetails: WarpRouteDetails | undefined;
  blur: boolean;
}

export function WarpRouteVisualizationCard({ message, warpRouteDetails, blur }: Props) {
  const multiProvider = useMultiProvider();
  const [isExpanded, setIsExpanded] = useState(false);

  // Get warp route visualization data
  const { visualization, isLoading: isVisualizationLoading } =
    useWarpRouteVisualization(warpRouteDetails);

  // Get balances with manual refresh
  const {
    balances,
    isLoading: isBalancesLoading,
    refresh: refreshBalances,
  } = useWarpRouteBalances(
    visualization?.tokens,
    visualization?.routeId,
    warpRouteDetails
      ? BigInt(toWei(warpRouteDetails.amount, warpRouteDetails.originToken.decimals ?? 18))
      : undefined,
  );

  // Get chain names
  const originChainName = useMemo(
    () => multiProvider.tryGetChainName(message.originDomainId) || 'Unknown',
    [multiProvider, message.originDomainId],
  );

  const destinationChainName = useMemo(
    () => multiProvider.tryGetChainName(message.destinationDomainId) || 'Unknown',
    [multiProvider, message.destinationDomainId],
  );

  // Calculate transfer amount in base units for comparison
  const transferAmount = useMemo(() => {
    if (!warpRouteDetails) return undefined;
    return BigInt(toWei(warpRouteDetails.amount, warpRouteDetails.originToken.decimals ?? 18));
  }, [warpRouteDetails]);

  // Show loading state while fetching visualization
  if (isVisualizationLoading) {
    return (
      <Card className="w-full">
        <div className="flex items-center justify-center py-8">
          <SpinnerIcon width={24} height={24} />
          <span className="ml-2 text-gray-500">Loading warp route...</span>
        </div>
      </Card>
    );
  }

  // Don't render if no warp route details or visualization
  if (!warpRouteDetails || !visualization) return null;

  return (
    <Card className={clsx('w-full', blur && 'blur-xs')}>
      {/* Collapsible Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between"
      >
        <div className="flex items-center gap-2">
          <Image src={HubIcon} width={28} height={28} alt="" className="opacity-80" />
          <h3 className="text-md font-medium text-blue-500">Warp Route Overview</h3>
          <Tooltip
            id="warp-route-overview-info"
            content="Visualization of the warp route showing all connected chains, their configuration, and collateral balances"
          />
        </div>
        <div className="flex items-center gap-2">
          {/* Route ID pill */}
          <div className="flex items-center gap-1 rounded-full bg-gray-100 px-3 py-1">
            <span className="font-mono text-xs text-gray-600">{visualization.routeId}</span>
            <CopyButton
              copyValue={visualization.routeId}
              width={12}
              height={12}
              className="opacity-60"
            />
          </div>
          <ChevronIcon
            width={20}
            height={20}
            direction={isExpanded ? 'n' : 's'}
            className="text-gray-400"
          />
        </div>
      </button>

      {/* Expandable Content */}
      {isExpanded && (
        <div className="mt-4 space-y-4">
          {/* Graph Visualization */}
          <div className="py-4">
            <WarpRouteGraph
              tokens={visualization.tokens}
              originChain={originChainName}
              destinationChain={destinationChainName}
              balances={balances}
              transferAmount={transferAmount}
              transferAmountDisplay={warpRouteDetails.amount}
              tokenSymbol={warpRouteDetails.originToken.symbol}
            />
          </div>

          {/* Refresh Balances Button */}
          <div className="flex justify-center">
            <button
              onClick={(e) => {
                e.stopPropagation();
                refreshBalances();
              }}
              disabled={isBalancesLoading}
              className="flex items-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isBalancesLoading ? (
                <SpinnerIcon width={16} height={16} />
              ) : (
                <RefreshIcon width={16} height={16} />
              )}
              Refresh Balances
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}
