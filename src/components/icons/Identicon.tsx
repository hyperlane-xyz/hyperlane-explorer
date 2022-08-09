import jazzicon from '@metamask/jazzicon';
import { CSSProperties, memo } from 'react';

import { isValidAddress, normalizeAddress } from '../../utils/addresses';
import { useIsSsr } from '../../utils/ssr';

type Props = {
  address: string;
  size?: number;
  styles?: CSSProperties;
};

// This should match metamask: https://github.com/MetaMask/metamask-extension/blob/master/ui/helpers/utils/icon-factory.js#L84
function addressToSeed(address: string) {
  const addrStub = normalizeAddress(address).slice(2, 10);
  return parseInt(addrStub, 16);
}

function _Identicon({ address, size: _size, styles }: Props) {
  const isSsr = useIsSsr();
  if (isSsr) {
    return null;
  }
  const size = _size ?? 34;

  if (!isValidAddress(address)) return null;

  const jazziconResult = jazzicon(size, addressToSeed(address));

  return (
    <div
      style={{ height: size, ...styles }}
      ref={(nodeElement) => {
        if (nodeElement) {
          nodeElement.innerHTML = '';
          nodeElement.appendChild(jazziconResult);
        }
      }}
    ></div>
  );
}

export const Identicon = memo(_Identicon);
