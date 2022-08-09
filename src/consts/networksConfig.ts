import { Chain, allChains as allChainsWagmi, chain } from 'wagmi';

import { RouterConfig, chainConnectionConfigs } from '@abacus-network/sdk';

export type AbcERC721Config = RouterConfig;

export const localTestConfigs = {
  test1: chainConnectionConfigs.test1,
  test2: chainConnectionConfigs.test2,
  test3: chainConnectionConfigs.test3,
};

export const testConfigs = {
  goerli: chainConnectionConfigs.goerli,
  alfajores: chainConnectionConfigs.alfajores,
};

export const prodConfigs = {
  ethereum: chainConnectionConfigs.ethereum,
  arbitrum: chainConnectionConfigs.arbitrum,
  optimism: chainConnectionConfigs.optimism,
  polygon: chainConnectionConfigs.polygon,
  celo: chainConnectionConfigs.celo,
  // TODO add BSC?
};

const celoMainnetWagmiChain: Chain = {
  id: 42220,
  name: 'Celo',
  network: 'celo',
  nativeCurrency: {
    decimals: 18,
    name: 'CELO',
    symbol: 'CELO',
  },
  rpcUrls: {
    default: 'https://forno.celo.org',
  },
  blockExplorers: {
    default: { name: 'CeloScan', url: 'https://celoscan.io' },
  },
  testnet: false,
};

const celoAlfajoresWagmiChain: Chain = {
  id: 44787,
  name: 'Alfajores',
  network: 'alfajores',
  nativeCurrency: {
    decimals: 18,
    name: 'CELO',
    symbol: 'CELO',
  },
  rpcUrls: {
    default: 'https://alfajores-forno.celo-testnet.org',
  },
  blockExplorers: {
    default: {
      name: 'Blockscout',
      url: 'https://alfajores-blockscout.celo-testnet.org',
    },
  },
  testnet: true,
};

export const prodChains = [
  chain.mainnet,
  chain.arbitrum,
  chain.optimism,
  chain.polygon,
  celoMainnetWagmiChain,
  // TODO add BSC?
];

export const testChains = [chain.goerli, celoAlfajoresWagmiChain];

export const allChains = [
  ...allChainsWagmi,
  celoMainnetWagmiChain,
  celoAlfajoresWagmiChain,
];
