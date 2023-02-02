import Image from 'next/image';
import { memo } from 'react';

import { ChainLogo } from '@hyperlane-xyz/widgets';

import ArrowRightIcon from '../../images/icons/arrow-right-short.svg';
import { useIsMobile } from '../../styles/mediaQueries';

function _ChainToChain({
  originChainId,
  destinationChainId,
  size = 32,
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
      <ChainLogo chainId={originChainId} size={size} />
      <Image src={ArrowRightIcon} width={arrowSize} height={arrowSize} alt="" />
      <ChainLogo chainId={destinationChainId} size={size} />
    </div>
  );
}

export const ChainToChain = memo(_ChainToChain);
