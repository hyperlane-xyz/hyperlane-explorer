import { Chain, allChains as allChainsWagmi, chain } from 'wagmi';

import { chainConnectionConfigs } from '@abacus-network/sdk';

export const testConfigs = {
  goerli: chainConnectionConfigs.goerli,
  alfajores: chainConnectionConfigs.alfajores,
};

export const prodConfigs = {
  arbitrum: chainConnectionConfigs.arbitrum,
  avalanche: chainConnectionConfigs.avalanche,
  bsc: chainConnectionConfigs.bsc,
  celo: chainConnectionConfigs.celo,
  ethereum: chainConnectionConfigs.ethereum,
  optimism: chainConnectionConfigs.optimism,
  polygon: chainConnectionConfigs.polygon,
};

export const avalancheChain: Chain = {
  id: 43114,
  name: 'Avalanche',
  network: 'avalanche',
  nativeCurrency: {
    decimals: 18,
    name: 'Avalanche',
    symbol: 'AVAX',
  },
  rpcUrls: {
    default: 'https://api.avax.network/ext/bc/C/rpc',
  },
  blockExplorers: {
    default: { name: 'SnowTrace', url: 'https://snowtrace.io' },
  },
  testnet: false,
};

export const bscChain: Chain = {
  id: 56,
  name: 'Binance Smart Chain',
  network: 'bsc',
  nativeCurrency: {
    decimals: 18,
    name: 'BNB',
    symbol: 'BNB',
  },
  rpcUrls: {
    default: 'https://bsc-dataseed.binance.org',
  },
  blockExplorers: {
    default: { name: 'BscScan', url: 'https://bscscan.com' },
  },
  testnet: false,
};

export const celoMainnetChain: Chain = {
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

export const celoAlfajoresChain: Chain = {
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
  chain.arbitrum,
  avalancheChain,
  bscChain,
  celoMainnetChain,
  chain.mainnet,
  chain.optimism,
  chain.polygon,
];

export const testChains = [chain.goerli, celoAlfajoresChain];

export const allChains = [
  ...allChainsWagmi,
  avalancheChain,
  bscChain,
  celoMainnetChain,
  celoAlfajoresChain,
];
