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
    <div className={`min-w-0 ${className}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-xs">
        <h4 className="text-gray-500">
          Warp fee <span className="text-xxs">(inferred)</span>
        </h4>
        <p className={`break-all font-mono font-medium text-gray-800 ${blur ? 'blur-xs' : ''}`}>
          {fees.bridgeFee} {fees.tokenSymbol}
          {fees.bridgeFeeBps ? ` (${fees.bridgeFeeBps} bps)` : ''}
        </p>
      </div>
      <p
        className="mt-1 text-xxs leading-relaxed text-gray-500"
        title="Inferred from origin transaction amounts, excluding identified IGP payments. This is a transfer-token route fee, not an all-in transaction cost."
      >
        Transfer + Warp fee:{' '}
        <span className={blur ? 'blur-xs' : ''}>
          {fees.totalSent} {fees.tokenSymbol}
        </span>{' '}
        · Excludes IGP payments.
      </p>
    </div>
  );
}
