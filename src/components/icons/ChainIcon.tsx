import Image from 'next/future/image';
import { memo } from 'react';
import { chain } from 'wagmi';

import {
  avalancheChain,
  bscChain,
  celoMainnetChain,
} from '../../consts/networksConfig';
import QuestionMark from '../../images/icons/question-mark.svg';
import Arbitrum from '../../images/logos/arbitrum.svg';
import Avalanche from '../../images/logos/avalanche.svg';
import Bsc from '../../images/logos/bsc.svg';
import Celo from '../../images/logos/celo.svg';
import EthMainnet from '../../images/logos/eth-mainnet.svg';
import Optimism from '../../images/logos/optimism.svg';
import Polygon from '../../images/logos/polygon.svg';
import { getChainName } from '../../utils/chains';

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
  size = 44,
}: {
  chainId?: number;
  size?: number;
}) {
  const imageSrc = (chainId && CHAIN_TO_ICON[chainId]) || QuestionMark;

  return (
    <div
      style={{ width: `${size}px`, height: `${size}px` }}
      className="flex items-center justify-center rounded-full bg-beige-300 transition-all"
      title={getChainName(chainId)}
    >
      <Image
        src={imageSrc}
        alt={`chain-${chainId}`}
        width={Math.floor(size / 2.2)}
        height={Math.floor(size / 2.2)}
      />
    </div>
  );
}

export const ChainIcon = memo(_ChainIcon);
