import { shortenAddress } from '@hyperlane-xyz/utils';
import { CopyButton } from '@hyperlane-xyz/widgets';

import { ChainLogo } from '../../../components/icons/ChainLogo';
import { useMultiProvider } from '../../../store';
import {
  TokenConnectionRef,
  WarpRouteTokenVisualization,
  WarpRouteVisualization,
} from './types';

// Token standards that participate in a cross-collateral router.
// Kept in sync with the SDK's TOKEN_CROSS_COLLATERAL_STANDARDS — duplicated as
// strings to avoid pulling the SDK type lookup into the render path.
const CROSS_COLLATERAL_STANDARDS = new Set<string>([
  'EvmHypCrossCollateralRouter',
  'TronHypCrossCollateralRouter',
  'SealevelHypCrossCollateral',
]);

function isCrossCollateralToken(token: WarpRouteTokenVisualization): boolean {
  return !!token.standard && CROSS_COLLATERAL_STANDARDS.has(token.standard);
}

/**
 * Whether the warp route has any cross-collateral sub-route on any chain.
 * Used to gate the enrollment section, which is only meaningful when
 * tokens can carry distinct sub-routes / collateral assets.
 */
export function hasCrossCollateralTokens(visualization: WarpRouteVisualization): boolean {
  return visualization.tokens.some(isCrossCollateralToken);
}

interface Props {
  visualization: WarpRouteVisualization;
}

/**
 * Lists every token in the warp route alongside its cross-collateral
 * enrollments (`connections` from the registry config). For routes that
 * use a CrossCollateralRouter this exposes the sub-route structure that
 * the main graph collapses into a flat token list.
 */
export function CrossCollateralEnrollments({ visualization }: Props) {
  const multiProvider = useMultiProvider();

  // Build a lookup so connection refs can resolve back to the rich token
  // metadata (symbol, collateral asset) inside this same route.
  const tokensByKey = new Map<string, WarpRouteTokenVisualization>();
  for (const token of visualization.tokens) {
    tokensByKey.set(tokenKey(token.chainName, token.addressOrDenom), token);
  }

  return (
    <div className="space-y-3">
      <div className="text-xs font-medium uppercase tracking-wide text-gray-500">
        Cross-collateral sub-route enrollments
      </div>
      <div className="space-y-2">
        {visualization.tokens.map((token) => (
          <EnrollmentRow
            key={tokenKey(token.chainName, token.addressOrDenom)}
            token={token}
            tokensByKey={tokensByKey}
            multiProvider={multiProvider}
          />
        ))}
      </div>
    </div>
  );
}

function EnrollmentRow({
  token,
  tokensByKey,
  multiProvider,
}: {
  token: WarpRouteTokenVisualization;
  tokensByKey: Map<string, WarpRouteTokenVisualization>;
  multiProvider: ReturnType<typeof useMultiProvider>;
}) {
  const displayName =
    multiProvider.tryGetChainMetadata(token.chainName)?.displayName || token.chainName;

  const enrollments = token.enrollments ?? [];

  return (
    <div className="rounded-md border border-gray-200 bg-white p-3 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <ChainLogo chainName={token.chainName} size={18} />
        <span className="font-semibold">{displayName}</span>
        <span className="rounded bg-gray-100 px-1.5 py-0.5 font-medium text-gray-700">
          {token.symbol || '—'}
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
          {enrollments.length} enrollment{enrollments.length === 1 ? '' : 's'}
        </span>
      </div>
      {enrollments.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {enrollments.map((enrollment) => (
            <EnrollmentChip
              key={enrollment.raw}
              connection={enrollment}
              peer={tokensByKey.get(tokenKey(enrollment.chainName, enrollment.addressOrDenom))}
              multiProvider={multiProvider}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function EnrollmentChip({
  connection,
  peer,
  multiProvider,
}: {
  connection: TokenConnectionRef;
  peer: WarpRouteTokenVisualization | undefined;
  multiProvider: ReturnType<typeof useMultiProvider>;
}) {
  const displayName =
    multiProvider.tryGetChainMetadata(connection.chainName)?.displayName || connection.chainName;

  return (
    <span className="flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5">
      <ChainLogo chainName={connection.chainName} size={12} />
      <span className="font-medium">{displayName}</span>
      {peer?.symbol && <span className="text-gray-600">· {peer.symbol}</span>}
      <span className="font-mono text-[10px] text-gray-500">
        {shortenAddress(connection.addressOrDenom)}
      </span>
    </span>
  );
}

function tokenKey(chainName: string, addressOrDenom: string): string {
  return `${chainName}:${addressOrDenom.toLowerCase()}`;
}
