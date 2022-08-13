import Image from 'next/future/image';
import { memo } from 'react';

import ArrowRightIcon from '../../images/icons/arrow-right-short.svg';

import { ChainIcon } from './ChainIcon';

function _ChainToChain({
  originChainId,
  destinationChainId,
  size,
}: {
  originChainId: number;
  destinationChainId: number;
  size?: number;
}) {
  return (
    <div className="flex items-center justify-center space-x-1 sm:space-x-2">
      <ChainIcon chainId={originChainId} size={size} />
      <Image src={ArrowRightIcon} alt="arrow-right" width={32} height={32} />
      <ChainIcon chainId={destinationChainId} size={size} />
    </div>
  );
}

export const ChainToChain = memo(_ChainToChain);
