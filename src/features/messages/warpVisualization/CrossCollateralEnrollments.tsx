import { shortenAddress } from '@hyperlane-xyz/utils';
import { CopyButton } from '@hyperlane-xyz/widgets';

import { ChainLogo } from '../../../components/icons/ChainLogo';
import { useMultiProvider } from '../../../store';
import { isCrossCollateralTokenStandard } from './tokenStandards';
import {
  getWarpRouteTokenKey,
  type WarpRouteEnrollment,
  type WarpRouteTokenVisualization,
  type WarpRouteVisualization,
} from './types';

export function hasCrossCollateralTokens(visualization: WarpRouteVisualization): boolean {
  return visualization.tokens.some((token) => isCrossCollateralTokenStandard(token.standard));
}

interface Props {
  visualization: WarpRouteVisualization;
}

export function CrossCollateralEnrollments({ visualization }: Props) {
  const multiProvider = useMultiProvider();

  if (!hasCrossCollateralTokens(visualization)) return null;

  return (
    <div className="space-y-2">
      <div className="text-xs font-medium uppercase tracking-wide text-gray-500">
        Route enrollments
      </div>
      <div className="space-y-2">
        {visualization.tokens.map((token) => (
          <EnrollmentRow
            key={getWarpRouteTokenKey(token)}
            token={token}
            multiProvider={multiProvider}
          />
        ))}
      </div>
    </div>
  );
}

function EnrollmentRow({
  token,
  multiProvider,
}: {
  token: WarpRouteTokenVisualization;
  multiProvider: ReturnType<typeof useMultiProvider>;
}) {
  const displayName =
    multiProvider.tryGetChainMetadata(token.chainName)?.displayName || token.chainName;

  return (
    <div className="rounded-md border border-gray-200 bg-white p-3 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <ChainLogo chainName={token.chainName} size={18} />
        <span className="font-semibold">{displayName}</span>
        <span className="rounded bg-gray-100 px-1.5 py-0.5 font-medium text-gray-700">
          {token.symbol || 'Unknown'}
        </span>
        {token.collateralAddressOrDenom && (
          <span className="flex items-center gap-1 text-[10px] text-gray-500">
            collateral
            <span className="font-mono">{shortenAddress(token.collateralAddressOrDenom)}</span>
            <CopyButton
              copyValue={token.collateralAddressOrDenom}
              width={10}
              height={10}
              className="opacity-50"
            />
          </span>
        )}
        <span className="ml-auto text-[10px] text-gray-500">
          {token.enrollments.length} enrollment{token.enrollments.length === 1 ? '' : 's'}
        </span>
      </div>
      {token.enrollments.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {token.enrollments.map((enrollment) => (
            <EnrollmentChip
              key={getWarpRouteTokenKey(enrollment)}
              enrollment={enrollment}
              multiProvider={multiProvider}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function EnrollmentChip({
  enrollment,
  multiProvider,
}: {
  enrollment: WarpRouteEnrollment;
  multiProvider: ReturnType<typeof useMultiProvider>;
}) {
  const displayName =
    multiProvider.tryGetChainMetadata(enrollment.chainName)?.displayName || enrollment.chainName;

  return (
    <span className="flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5">
      <ChainLogo chainName={enrollment.chainName} size={12} />
      <span className="font-medium">{displayName}</span>
      {enrollment.symbol && <span className="text-gray-600">- {enrollment.symbol}</span>}
      <span className="font-mono text-[10px] text-gray-500">
        {shortenAddress(enrollment.addressOrDenom)}
      </span>
    </span>
  );
}
