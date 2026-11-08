import { toWei } from '@hyperlane-xyz/utils';
import { CopyButton, RefreshIcon, SpinnerIcon } from '@hyperlane-xyz/widgets';
import clsx from 'clsx';
import { useMemo } from 'react';

import { WarpRouteDetails } from '../../../types';
import { RouteEnrollments } from '../warpVisualization/RouteEnrollments';
import { WarpRouteVisualization } from '../warpVisualization/types';
import { useWarpRouteBalances } from '../warpVisualization/useWarpRouteBalances';
import { WarpRouteGraph } from '../warpVisualization/WarpRouteGraph';

interface Props {
  warpRouteDetails: WarpRouteDetails;
  visualization: WarpRouteVisualization;
  blur: boolean;
}

// Mounted only after the Warp route tab is opened, keeping balance RPC calls deferred.
export function WarpRouteVisualizationCard({ warpRouteDetails, visualization, blur }: Props) {
  const transferAmount = useMemo(
    () => BigInt(toWei(warpRouteDetails.amount, warpRouteDetails.originToken.decimals ?? 18)),
    [warpRouteDetails.amount, warpRouteDetails.originToken.decimals],
  );
  const {
    balances,
    isFetching: isBalancesFetching,
    refetch: refetchBalances,
  } = useWarpRouteBalances(visualization.tokens, visualization.routeId, transferAmount);

  return (
    <div className={clsx('min-w-0 space-y-4', blur && 'blur-xs')}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <h3 className="shrink-0 text-sm font-medium text-gray-700">Warp route</h3>
          <span className="min-w-0 break-words font-mono text-xs text-gray-500">
            {visualization.routeId}
          </span>
          <CopyButton
            copyValue={visualization.routeId}
            width={12}
            height={12}
            className="shrink-0 opacity-50"
          />
        </div>
        <button
          type="button"
          onClick={() => refetchBalances()}
          disabled={isBalancesFetching}
          className="flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isBalancesFetching ? (
            <SpinnerIcon width={14} height={14} />
          ) : (
            <RefreshIcon width={14} height={14} />
          )}
          Refresh balances
        </button>
      </div>

      <WarpRouteGraph
        tokens={visualization.tokens}
        originChain={warpRouteDetails.originToken.chainName}
        destinationChain={warpRouteDetails.destinationToken.chainName}
        originAddressOrDenom={warpRouteDetails.originToken.addressOrDenom}
        destinationAddressOrDenom={warpRouteDetails.destinationToken.addressOrDenom}
        balances={balances}
        transferAmount={transferAmount}
        transferAmountDisplay={warpRouteDetails.amount}
        tokenSymbol={warpRouteDetails.originToken.symbol}
      />

      <RouteEnrollments visualization={visualization} />
    </div>
  );
}
