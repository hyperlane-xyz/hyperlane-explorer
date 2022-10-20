import Image from 'next/future/image';
import { memo } from 'react';
import { chain } from 'wagmi';

import {
  auroraTestnetChain,
  avalancheChain,
  bscChain,
  bscTestnetChain,
  celoAlfajoresChain,
  celoMainnetChain,
  fujiTestnetChain,
  moonbaseAlphaChain,
  moonbeam,
} from '../../consts/chains';
import QuestionMark from '../../images/icons/question-mark.svg';
import Arbitrum from '../../images/logos/arbitrum.svg';
import Avalanche from '../../images/logos/avalanche.svg';
import Bsc from '../../images/logos/bsc.svg';
import Celo from '../../images/logos/celo.svg';
import EthMainnet from '../../images/logos/eth-mainnet.svg';
import Moonbeam from '../../images/logos/moonbeam.svg';
import Near from '../../images/logos/near.svg';
import Optimism from '../../images/logos/optimism.svg';
import Polygon from '../../images/logos/polygon.svg';
import { getChainDisplayName } from '../../utils/chains';

// Keep up to date as new chains are added or
// icon will fallback to default
const CHAIN_TO_ICON = {
  // Prod chains
  [chain.mainnet.id]: EthMainnet,
  [chain.arbitrum.id]: Arbitrum,
  [chain.optimism.id]: Optimism,
  [chain.polygon.id]: Polygon,
  [avalancheChain.id]: Avalanche,
  [bscChain.id]: Bsc,
  [celoMainnetChain.id]: Celo,

  // Test chains
  [chain.goerli.id]: EthMainnet, // TODO
  [chain.kovan.id]: EthMainnet, // TODO
  [chain.arbitrumGoerli.id]: Arbitrum,
  [chain.arbitrumRinkeby.id]: Arbitrum,
  [chain.optimismGoerli.id]: Optimism,
  [chain.optimismKovan.id]: Optimism,
  [chain.polygonMumbai.id]: Polygon,
  [fujiTestnetChain.id]: Avalanche,
  [bscTestnetChain.id]: Bsc,
  [celoAlfajoresChain.id]: Celo,
  [auroraTestnetChain.id]: Near,
  [moonbeam.id]: Moonbeam,
  [moonbaseAlphaChain.id]: Moonbeam,
};

function _ChainIcon({ chainId, size = 44 }: { chainId?: number; size?: number }) {
  const imageSrc = (chainId && CHAIN_TO_ICON[chainId]) || QuestionMark;

  return (
    <div
      style={{ width: `${size}px`, height: `${size}px` }}
      className="flex items-center justify-center rounded-full bg-beige-300 transition-all"
      title={getChainDisplayName(chainId)}
    >
      <Image src={imageSrc} alt="" width={Math.floor(size / 2.2)} height={Math.floor(size / 2.2)} />
    </div>
  );
}

export const ChainIcon = memo(_ChainIcon);
