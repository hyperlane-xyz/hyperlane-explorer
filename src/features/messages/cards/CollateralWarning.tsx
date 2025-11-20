import Link from 'next/link';

import { Message, WarpRouteDetails } from '../../../types';
import { CollateralStatus, formatCollateralAmount, RebalanceInfo } from '../collateral/types';
import { useActiveRebalances } from '../collateral/useActiveRebalances';
import { useCollateralStatus } from '../collateral/useCollateralStatus';

interface Props {
  message: Message;
  warpRouteDetails: WarpRouteDetails | undefined;
}

export function CollateralWarning({ message, warpRouteDetails }: Props) {
  const collateralInfo = useCollateralStatus(message, warpRouteDetails);
  const activeRebalances = useActiveRebalances(warpRouteDetails);

  // Debug logging
  console.log('[CollateralWarning] Render:', {
    collateralStatus: collateralInfo.status,
    hasMessage: !!message,
    hasWarpRouteDetails: !!warpRouteDetails,
    messageStatus: message?.status,
    destinationTokenStandard: warpRouteDetails?.destinationToken?.standard,
    collateralInfo,
  });

  // Don't show anything if not checking or unknown
  if (
    collateralInfo.status === CollateralStatus.Unknown ||
    collateralInfo.status === CollateralStatus.Checking
  ) {
    console.log('[CollateralWarning] Not showing warning, status is:', collateralInfo.status);
    return null;
  }

  // Calculate formatted amounts once for all warning types
  const decimals = warpRouteDetails?.destinationToken.decimals || 18;
  const required = collateralInfo.required
    ? formatCollateralAmount(collateralInfo.required, decimals)
    : 'N/A';
  const available = collateralInfo.available
    ? formatCollateralAmount(collateralInfo.available, decimals)
    : 'N/A';
  const deficit = collateralInfo.deficit
    ? formatCollateralAmount(collateralInfo.deficit, decimals)
    : 'N/A';
  const utilization = collateralInfo.utilizationPercent?.toFixed(1) || 'N/A';

  // Show insufficient collateral warning
  if (collateralInfo.status === CollateralStatus.Insufficient) {
    return (
      <div className="rounded-md border border-red-300 bg-red-50 px-4 py-3">
        <div className="flex items-start">
          <div className="flex-shrink-0">
            <svg
              className="h-5 w-5 text-red-400"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <div className="ml-3 flex-1">
            <h3 className="text-sm font-medium text-red-800">Insufficient Collateral</h3>
            <div className="mt-2 text-sm text-red-700">
              <p>
                This transfer cannot be completed due to insufficient collateral on the destination
                chain.
              </p>
              <div className="mt-2 space-y-1 font-mono text-xs">
                <div>Required: {required}</div>
                <div>Available: {available}</div>
                <div className="font-semibold">Deficit: {deficit}</div>
              </div>
              {activeRebalances && activeRebalances.rebalances.length > 0 && (
                <div className="mt-3">
                  <RebalanceList rebalances={activeRebalances.rebalances} />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Show low collateral warning
  if (collateralInfo.status === CollateralStatus.Low) {
    return (
      <div className="rounded-md border border-yellow-300 bg-yellow-50 px-4 py-3">
        <div className="flex items-start">
          <div className="flex-shrink-0">
            <svg
              className="h-5 w-5 text-yellow-400"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <div className="ml-3 flex-1">
            <h3 className="text-sm font-medium text-yellow-800">Low Collateral</h3>
            <div className="mt-2 text-sm text-yellow-700">
              <p>
                Collateral is running low on the destination chain ({utilization}% utilized).
                Rebalancing may be needed soon.
              </p>
              <div className="mt-1 font-mono text-xs">Available: {available}</div>
              {activeRebalances && activeRebalances.rebalances.length > 0 && (
                <div className="mt-3">
                  <RebalanceList rebalances={activeRebalances.rebalances} />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Show active rebalances if collateral is sufficient
  if (
    collateralInfo.status === CollateralStatus.Sufficient &&
    activeRebalances &&
    activeRebalances.rebalances.length > 0
  ) {
    return (
      <div className="rounded-md border border-blue-300 bg-blue-50 px-4 py-3">
        <div className="flex items-start">
          <div className="flex-shrink-0">
            <svg
              className="h-5 w-5 text-blue-400"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="1.5"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
              />
            </svg>
          </div>
          <div className="ml-3 flex-1">
            <h3 className="text-sm font-medium text-blue-800">Active Rebalance</h3>
            <div className="mt-2 text-sm text-blue-700">
              <RebalanceList rebalances={activeRebalances.rebalances} />
            </div>
          </div>
        </div>
      </div>
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
