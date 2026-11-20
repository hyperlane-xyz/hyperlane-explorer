import { fromWei } from '@hyperlane-xyz/utils';

import { WarpRouteDetails } from '../../../types';
import { formatAmountWithCommas } from '../../../utils/amount';
import { CollateralInfo } from '../collateral/types';

const DEFAULT_DECIMALS = 18;
const DEFAULT_SYMBOL = 'tokens';

interface CollateralCardsProps {
  warpRouteDetails: WarpRouteDetails | undefined;
  collateralInfo: CollateralInfo;
}

function formatCollateralAmount(amount: bigint | undefined, decimals: number) {
  return amount === undefined
    ? 'N/A'
    : formatAmountWithCommas(fromWei(amount.toString(), decimals));
}

export function CollateralDeficitDetails({
  warpRouteDetails,
  collateralInfo,
}: CollateralCardsProps) {
  const decimals = warpRouteDetails?.destinationToken.decimals ?? DEFAULT_DECIMALS;
  const symbol = warpRouteDetails?.destinationToken.symbol ?? DEFAULT_SYMBOL;
  const values = [
    ['Available', collateralInfo.available],
    ['Required', collateralInfo.required],
    ['Deficit', collateralInfo.deficit],
  ] as const;

  return (
    <div className="space-y-1 tabular-nums">
      {values.map(([label, amount]) => (
        <div key={label}>
          <span className="font-medium">{label}:</span> {formatCollateralAmount(amount, decimals)}{' '}
          {symbol}
        </div>
      ))}
    </div>
  );
}
