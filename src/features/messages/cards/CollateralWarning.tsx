import { ErrorIcon, RefreshIcon, WarningIcon } from '@hyperlane-xyz/widgets';
import Link from 'next/link';

import { Message, WarpRouteDetails } from '../../../types';
import { CollateralStatus, formatCollateralAmount, RebalanceInfo } from '../collateral/types';
import { useActiveRebalances } from '../collateral/useActiveRebalances';
import { useCollateralStatus } from '../collateral/useCollateralStatus';
import { WarningCard } from './WarningCard';

const DEFAULT_DECIMALS = 18;
const DEFAULT_SYMBOL = 'tokens';

interface Props {
  message: Message;
  warpRouteDetails: WarpRouteDetails | undefined;
}

export function CollateralWarning({ message, warpRouteDetails }: Props) {
  const collateralInfo = useCollateralStatus(message, warpRouteDetails);
  const activeRebalances = useActiveRebalances(warpRouteDetails);

  // Don't show warnings for unknown or loading states
  if (
    collateralInfo.status === CollateralStatus.Unknown ||
    collateralInfo.status === CollateralStatus.Checking
  ) {
    return null;
  }

  // Show insufficient collateral warning
  if (collateralInfo.status === CollateralStatus.Insufficient) {
    const decimals = warpRouteDetails?.destinationToken.decimals ?? DEFAULT_DECIMALS;
    const symbol = warpRouteDetails?.destinationToken.symbol ?? DEFAULT_SYMBOL;
    const deficit = collateralInfo.deficit
      ? formatCollateralAmount(collateralInfo.deficit, decimals)
      : 'N/A';
    const available = collateralInfo.available
      ? formatCollateralAmount(collateralInfo.available, decimals)
      : 'N/A';
    const required = collateralInfo.required
      ? formatCollateralAmount(collateralInfo.required, decimals)
      : 'N/A';

    return (
      <WarningCard
        level="error"
        icon={<ErrorIcon width={20} height={20} color="#f87171" />}
        title="Insufficient Collateral"
      >
        <p>This transfer cannot be completed due to insufficient collateral.</p>
        <div className="mt-2 space-y-1">
          <div>
            <span className="font-medium">Available:</span> {available} {symbol}
          </div>
          <div>
            <span className="font-medium">Required:</span> {required} {symbol}
          </div>
          <div>
            <span className="font-medium">Deficit:</span> {deficit} {symbol}
          </div>
        </div>
        {activeRebalances && activeRebalances.rebalances.length > 0 && (
          <div className="mt-3">
            <RebalanceList rebalances={activeRebalances.rebalances} />
          </div>
        )}
      </WarningCard>
    );
  }

  // Show low collateral warning
  if (collateralInfo.status === CollateralStatus.Low) {
    const decimals = warpRouteDetails?.destinationToken.decimals ?? DEFAULT_DECIMALS;
    const symbol = warpRouteDetails?.destinationToken.symbol ?? DEFAULT_SYMBOL;
    const utilization = collateralInfo.utilizationPercent?.toFixed(1) ?? 'N/A';
    const available = collateralInfo.available
      ? formatCollateralAmount(collateralInfo.available, decimals)
      : 'N/A';
    const required = collateralInfo.required
      ? formatCollateralAmount(collateralInfo.required, decimals)
      : 'N/A';

    return (
      <WarningCard
        level="warning"
        icon={<WarningIcon width={20} height={20} color="#fbbf24" />}
        title="Low Collateral"
      >
        <p>Collateral is running low ({utilization}% utilized). Rebalancing may be needed soon.</p>
        <div className="mt-2 space-y-1">
          <div>
            <span className="font-medium">Available:</span> {available} {symbol}
          </div>
          <div>
            <span className="font-medium">Required:</span> {required} {symbol}
          </div>
        </div>
        {activeRebalances && activeRebalances.rebalances.length > 0 && (
          <div className="mt-3">
            <RebalanceList rebalances={activeRebalances.rebalances} />
          </div>
        )}
      </WarningCard>
    );
  }

  // Show active rebalances if collateral is sufficient
  if (
    collateralInfo.status === CollateralStatus.Sufficient &&
    activeRebalances &&
    activeRebalances.rebalances.length > 0
  ) {
    return (
      <WarningCard
        level="info"
        icon={<RefreshIcon width={20} height={20} color="#60a5fa" />}
        title="Active Rebalance"
      >
        <RebalanceList rebalances={activeRebalances.rebalances} />
      </WarningCard>
    );
  }

  return null;
}

function RebalanceList({ rebalances }: { rebalances: RebalanceInfo[] }) {
  if (rebalances.length === 0) return null;

  const pendingRebalances = rebalances.filter((r) => !r.isDelivered);
  const count = pendingRebalances.length;

  if (count === 0) return null;

  return (
    <div className="space-y-2">
      <p className="font-medium">
        {count} rebalance transaction{count > 1 ? 's' : ''} in progress:
      </p>
      <ul className="space-y-2">
        {pendingRebalances.slice(0, 3).map((rebalance, idx) => (
          <li key={idx} className="text-xs">
            <div className="flex items-center space-x-2">
              <span className="rounded bg-white px-2 py-1 font-mono">
                {rebalance.txHash.slice(0, 10)}...
              </span>
              {rebalance.messageId && (
                <Link
                  href={`/message/${rebalance.messageId}`}
                  className="text-blue-600 underline hover:text-blue-800"
                >
                  View message →
                </Link>
              )}
            </div>
          </li>
        ))}
        {pendingRebalances.length > 3 && (
          <li className="text-xs italic">And {pendingRebalances.length - 3} more...</li>
        )}
      </ul>
    </div>
  );
}
