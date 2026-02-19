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

  // Get warp route visualization data (from registry, no RPC calls)
  const { visualization } = useWarpRouteVisualization(warpRouteDetails);

  // Get balances with manual refetch - only fetch when expanded
  const {
    balances,
    isLoading: isBalancesLoading,
    refetch: refetchBalances,
  } = useWarpRouteBalances(
    visualization?.tokens,
    visualization?.routeId,
    warpRouteDetails
      ? BigInt(toWei(warpRouteDetails.amount, warpRouteDetails.originToken.decimals ?? 18))
      : undefined,
    isExpanded, // Only fetch balances when expanded
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

  // Don't render if no warp route details or visualization
  if (!warpRouteDetails || !visualization) return null;

  return (
    <Card className={clsx('w-full', blur && 'blur-xs')}>
      {/* Collapsible Header */}
      <div className="flex w-full items-center justify-between">
        <button onClick={() => setIsExpanded(!isExpanded)} className="flex items-center gap-2">
          <Image src={HubIcon} width={28} height={28} alt="" className="opacity-80" />
          <h3 className="text-md font-medium text-blue-500">Warp Route Overview</h3>
          <Tooltip
            id="warp-route-overview-info"
            content="Visualization of the warp route showing all connected chains, their configuration, and collateral balances"
          />
        </button>
        <div className="flex items-center gap-2">
          {/* Route ID pill - outside button to prevent toggle on copy */}
          <div className="flex items-center gap-1 rounded-md bg-[#e5e7eb] px-2.5 py-1.5">
            <span className="font-mono text-xs font-light text-gray-800">{visualization.routeId}</span>
            <CopyButton
              copyValue={visualization.routeId}
              width={12}
              height={12}
              className="opacity-50"
            />
          </div>
          <button onClick={() => setIsExpanded(!isExpanded)}>
            <ChevronIcon
              width={20}
              height={20}
              direction={isExpanded ? 'n' : 's'}
              className="text-gray-400"
            />
          </button>
        </div>
      </div>

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
                refetchBalances();
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
