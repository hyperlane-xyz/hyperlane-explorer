import { isZeroishAddress } from '@hyperlane-xyz/utils';

import type { OwnerKind, SafeInfo } from '../../queries/fetchWarpRouteIsm';
import { AddressInline } from './AddressInline';

interface Props {
  owner: string;
  ownerKind: OwnerKind;
  safeInfo?: SafeInfo;
  chainName: string;
}

export function OwnerDisplay({ owner, ownerKind, safeInfo, chainName }: Props) {
  const isZero = isZeroishAddress(owner);

  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="font-bold text-gray-800">Owner</span>
      {isZero ? (
        <span className="text-gray-500">Ownership renounced</span>
      ) : (
        <>
          <AddressInline address={owner} chainName={chainName} />
          <OwnerKindBadge kind={ownerKind} safeInfo={safeInfo} />
        </>
      )}
    </div>
  );
}

function OwnerKindBadge({ kind, safeInfo }: { kind: OwnerKind; safeInfo?: SafeInfo }) {
  if (kind !== 'safe') return null;
  const label = safeInfo?.ownerCount
    ? `Safe ${safeInfo.threshold}/${safeInfo.ownerCount}`
    : `Safe (threshold ${safeInfo?.threshold ?? '?'})`;
  return (
    <span className="bg-primary-50 text-primary-700 rounded px-1.5 py-0.5 text-xs font-medium">
      {label}
    </span>
  );
}
