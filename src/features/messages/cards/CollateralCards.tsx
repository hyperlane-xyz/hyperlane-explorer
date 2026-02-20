import { ErrorIcon, Modal, RefreshIcon, useModal } from '@hyperlane-xyz/widgets';
import Link from 'next/link';

import { fromWei } from '@hyperlane-xyz/utils';
import { TextButton } from '../../../components/buttons/TextButton';
import { Color } from '../../../styles/Color';
import { WarpRouteDetails } from '../../../types';
import { CollateralInfo, CollateralStatus, RebalanceInfo } from '../collateral/types';
import { useActiveRebalances } from '../collateral/useActiveRebalances';

const DEFAULT_DECIMALS = 18;
const DEFAULT_SYMBOL = 'tokens';

interface CollateralCardsProps {
  warpRouteDetails: WarpRouteDetails | undefined;
  collateralInfo: CollateralInfo;
}

export function InsufficientCollateralWarning({
  warpRouteDetails,
  collateralInfo,
}: CollateralCardsProps) {
  const decimals = warpRouteDetails?.destinationToken.decimals ?? DEFAULT_DECIMALS;
  const symbol = warpRouteDetails?.destinationToken.symbol ?? DEFAULT_SYMBOL;
  // Show insufficient collateral warning
  const deficit = collateralInfo.deficit
    ? fromWei(collateralInfo.deficit.toString(), decimals)
    : 'N/A';
  const available = collateralInfo.available
    ? fromWei(collateralInfo.available.toString(), decimals)
    : 'N/A';
  const required = collateralInfo.required
    ? fromWei(collateralInfo.required.toString(), decimals)
    : 'N/A';

  if (collateralInfo.status !== CollateralStatus.Insufficient) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <ErrorIcon width={20} height={20} color={Color.red} />
        <h3 className="text-sm font-medium text-red-600">Insufficient Collateral</h3>
      </div>
      <div className="text-sm text-gray-700">
        <p className="mb-2">This transfer cannot be completed due to insufficient collateral.</p>
        <div className="space-y-1">
          <div>
            <span className="font-medium">Available:</span> {available} {symbol}
          </div>
          <div>
            <span className="font-medium">Required:</span> {required} {symbol}
          </div>
          <div>
            <span className="font-medium text-red-600">Deficit:</span> {deficit} {symbol}
          </div>
        </div>
        <ActiveRebalanceModal warpRouteDetails={warpRouteDetails} collateralInfo={collateralInfo} />
      </div>
    </div>
  );
}

export function ActiveRebalanceModal({ warpRouteDetails }: CollateralCardsProps) {
  const activeRebalances = useActiveRebalances(warpRouteDetails);
  const { isOpen, open, close } = useModal();

  if (!activeRebalances || !activeRebalances.rebalances.length) return null;

  // Show active rebalances if collateral is sufficient
  return (
    <div className="space-y-3">
      <TextButton
        classes="flex gap-1 cursor-pointer text-sm text-blue-500 underline underline-offset-1 transition-all hover:text-blue-600 active:text-blue-700"
        onClick={open}
      >
        <RefreshIcon width={20} height={20} color={Color.blue} />
        View Active Rebalance
      </TextButton>

      <Modal isOpen={isOpen} close={close} panelClassname="max-w-lg p-4 sm:p-5">
        <div className="text-sm text-gray-700">
          <RebalanceList rebalances={activeRebalances.rebalances} />
        </div>
      </Modal>
    </div>
  );
}

function RebalanceList({ rebalances }: { rebalances: RebalanceInfo[] }) {
  const pendingRebalances = rebalances.filter((r) => !r.isDelivered);
  const count = pendingRebalances.length;

  if (count === 0) return null;

  return (
    <div className="space-y-2">
      <p className="font-medium">
        {count} rebalance transaction{count > 1 ? 's' : ''} in progress:
      </p>
      <ul className="space-y-2">
        {pendingRebalances.slice(0, 3).map((rebalance) => (
          <li key={rebalance.txHash} className="flex items-center space-x-2 text-xs">
            <span className="rounded bg-white font-mono">{rebalance.txHash.slice(0, 12)}...</span>
            {rebalance.messageId && (
              <Link
                href={`/message/${rebalance.messageId}`}
                className="text-blue-600 underline hover:text-blue-800"
                target="_blank"
              >
                View message →
              </Link>
            )}
          </li>
        ))}
        {pendingRebalances.length > 3 && (
          <li className="text-xs italic">And {pendingRebalances.length - 3} more...</li>
        )}
      </ul>
    </div>
  );
}
