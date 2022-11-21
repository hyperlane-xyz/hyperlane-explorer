import Image from 'next/future/image';
import { memo } from 'react';

import ArrowRightIcon from '../../images/icons/arrow-right-short.svg';
import { useIsMobile } from '../../styles/mediaQueries';

import { ChainIcon } from './ChainIcon';

function _ChainToChain({
  originChainId,
  destinationChainId,
  size = 36,
  arrowSize = 32,
  isNarrow = false,
}: {
  originChainId: number;
  destinationChainId: number;
  size?: number;
  arrowSize?: number;
  isNarrow?: boolean;
}) {
  const isMobile = useIsMobile();
  if (isMobile) {
    size = Math.floor(size * 0.8);
    arrowSize = Math.floor(arrowSize * 0.8);
  }

  return (
    <div
      className={`flex items-center justify-center sm:space-x-1 ${isNarrow ? '' : 'md:space-x-2'}`}
    >
      <ChainIcon chainId={originChainId} size={size} />
      <Image src={ArrowRightIcon} width={arrowSize} height={arrowSize} alt="" />
      <ChainIcon chainId={destinationChainId} size={size} />
    </div>
  );
}

export const ChainToChain = memo(_ChainToChain);
