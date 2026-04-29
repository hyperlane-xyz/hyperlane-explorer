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
        <span className="text-gray-500">No owner (immutable)</span>
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
  if (kind === 'safe') {
    const label = safeInfo?.ownerCount
      ? `Safe ${safeInfo.threshold}/${safeInfo.ownerCount}`
      : `Safe (threshold ${safeInfo?.threshold ?? '?'})`;
    return (
      <span className="rounded bg-primary-50 px-1.5 py-0.5 text-xs font-medium text-primary-700">
        {label}
      </span>
    );
  }
  if (kind === 'eoa') {
    return (
      <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-600">
        EOA
      </span>
    );
  }
  return null;
}
