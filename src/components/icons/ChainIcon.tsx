import Image from 'next/future/image';
import { memo } from 'react';
import { chain } from 'wagmi';

import {
  avalancheChain,
  bscChain,
  celoMainnetChain,
} from '../../consts/networksConfig';
import Cube from '../../images/icons/cube.svg';
import Arbitrum from '../../images/logos/arbitrum.svg';
import Avalanche from '../../images/logos/avalanche.svg';
import Bsc from '../../images/logos/bsc.svg';
import Celo from '../../images/logos/celo.svg';
import EthMainnet from '../../images/logos/eth-mainnet.svg';
import Optimism from '../../images/logos/optimism.svg';
import Polygon from '../../images/logos/polygon.svg';

const CHAIN_TO_ICON = {
  [chain.arbitrum.id]: Arbitrum,
  [avalancheChain.id]: Avalanche,
  [bscChain.id]: Bsc,
  [celoMainnetChain.id]: Celo,
  [chain.mainnet.id]: EthMainnet,
  [chain.optimism.id]: Optimism,
  [chain.polygon.id]: Polygon,
};

function _ChainIcon({
  chainId,
  size = 46,
}: {
  chainId: number;
  size?: number;
}) {
  //TODO replace cube with question mark as default
  const imageSrc = CHAIN_TO_ICON[chainId] || Cube;
  return (
    <div
      style={{ width: `${size}px`, height: `${size}px` }}
      className="flex items-center justify-center rounded-full bg-beige-500"
    >
      <Image
        src={imageSrc}
        alt={`chain-${chainId}`}
        width={size / 2.2}
        height={size / 2.2}
      />
    </div>
  );
}

export const ChainIcon = memo(_ChainIcon);
