import Image from 'next/future/image';
import { memo } from 'react';

import ArrowRightIcon from '../../images/icons/arrow-right-short.svg';
import Asterisk from '../../images/icons/asterisk.svg';
import Key from '../../images/icons/key.svg';
import { useIsMobile } from '../../styles/mediaQueries';

function _InterchainAccount({ size = 44, arrowSize = 32 }: { size?: number; arrowSize?: number }) {
  const isMobile = useIsMobile();
  if (isMobile) {
    size = Math.floor(size * 0.8);
    arrowSize = Math.floor(arrowSize * 0.8);
  }

  return (
    <div className="flex items-center justify-center sm:space-x-1 md:space-x-2">
      <div
        style={{ width: `${size}px`, height: `${size}px` }}
        className="flex items-center justify-center rounded-full bg-gray-100 transition-all"
      >
        <Image src={Key} alt="" width={Math.floor(size / 2)} height={Math.floor(size / 2.2)} />
      </div>
      <Image src={ArrowRightIcon} width={arrowSize} height={arrowSize} alt="" />
      <div
        style={{ width: `${size}px`, height: `${size}px` }}
        className="flex items-center justify-center rounded-full bg-gray-100 transition-all"
      >
        <Image src={Asterisk} alt="" width={Math.floor(size / 2.6)} height={Math.floor(size / 3)} />
      </div>
    </div>
  );
}

export const InterchainAccount = memo(_InterchainAccount);
