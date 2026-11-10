import type { Message, MessageStub, WarpRouteDetails } from '../../../types';
import { useWarpFees } from '../warpFees/useWarpFees';

export function WarpFeeDetails({
  message,
  warpRouteDetails,
  blur,
  className = 'border-t border-gray-200 pt-3',
}: {
  message: Message | MessageStub;
  warpRouteDetails?: WarpRouteDetails;
  blur: boolean;
  className?: string;
}) {
  const fees = useWarpFees(message, warpRouteDetails);
  if (!warpRouteDetails || !fees) return null;

  return (
    <dl className={`grid min-w-0 gap-3 text-xs sm:grid-cols-2 sm:gap-6 ${className}`}>
      <div className="min-w-0">
        <dt
          className="text-gray-500"
          title="Inferred from origin transaction amounts. BPS is the effective fee divided by the transferred amount, rounded to two decimals; it is not the configured fee rate."
        >
          Warp fee
        </dt>
        <dd className={`mt-1 break-all font-mono text-gray-800 ${blur ? 'blur-xs' : ''}`}>
          {fees.bridgeFee} {fees.tokenSymbol}
          {fees.bridgeFeeBps ? ` (≈${fees.bridgeFeeBps} bps)` : ''}
        </dd>
      </div>
      <div className="min-w-0">
        <dt
          className="text-gray-500"
          title="Transfer amount plus Warp fee. Excludes IGP payments and transaction gas."
        >
          Total debited (excl. gas)
        </dt>
        <dd className={`mt-1 break-all font-mono text-gray-800 ${blur ? 'blur-xs' : ''}`}>
          {fees.totalSent} {fees.tokenSymbol}
        </dd>
      </div>
    </dl>
  );
}
