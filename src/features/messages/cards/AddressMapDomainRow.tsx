import { useEffect, useState } from 'react';

import { isZeroishAddress } from '@hyperlane-xyz/utils';

import { CopyButton } from '../../../components/buttons/CopyButton';
import { resolveAddressToDomain } from '../utils';

interface Props {
  label: string;
  address: string;
  blur: boolean;
  queryChainId: number;
  displayWidth?: string;
}

export function AddressMapDomainRow({
  label,
  address,
  blur,
  queryChainId,
  displayWidth = 'w-64 sm:w-64',
}: Props) {
  const [domain, setDomain] = useState<string | undefined>();

  useEffect(() => {
    if (isZeroishAddress(address)) {
      return;
    }
    resolveAddressToDomain(address, queryChainId)
      .then((res) => {
        if (res) {
          setDomain(res);
        }
      })
      .catch((err) => {
        console.error('err: ', err);
      });
  }, [address, queryChainId]);

  return (
    <div className={`flex items-center pl-px font-light`}>
      <label className={`text-sm text-gray-500 w-16`}>{label}</label>
      <div
        className={`text-sm ml-1 truncate ${displayWidth} ${blur && 'blur-xs'}`}
        title={domain ? `${domain} ${address}` : address}
      >
        <span>{domain ?? address}</span>
      </div>
      <CopyButton copyValue={address} width={13} height={13} classes="ml-1.5" />
    </div>
  );
}
