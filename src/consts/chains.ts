import { Chain, allChains as allChainsWagmi, chain } from 'wagmi';

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

export const fujiTestnetChain: Chain = {
  id: 43113,
  name: 'Fuji Testnet',
  network: 'fuji',
  nativeCurrency: {
    decimals: 18,
    name: 'Avalanche',
    symbol: 'AVAX',
  },
  rpcUrls: {
    default: 'https://api.avax-test.network/ext/bc/C/rpc',
  },
  blockExplorers: {
    default: {
      name: 'Snowtrace',
      url: 'https://testnet.snowtrace.io',
    },
  },
  testnet: true,
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
    etherscan: { name: 'BscScan', url: 'https://bscscan.com' },
    default: { name: 'BscScan', url: 'https://bscscan.com' },
  },
  testnet: false,
};

export const bscTestnetChain: Chain = {
  id: 97,
  name: 'Bsc Testnet',
  network: 'bscTestnet',
  nativeCurrency: {
    decimals: 18,
    name: 'BNB',
    symbol: 'BNB',
  },
  rpcUrls: {
    default: 'https://data-seed-prebsc-1-s3.binance.org:8545',
  },
  blockExplorers: {
    etherscan: { name: 'BscScan', url: 'https://testnet.bscscan.com' },
    default: { name: 'BscScan', url: 'https://testnet.bscscan.com' },
  },
  testnet: true,
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
    etherscan: { name: 'CeloScan', url: 'https://celoscan.io' },
    blockscout: {
      name: 'Blockscout',
      url: 'https://explorer.celo.org',
    },
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
    etherscan: { name: 'CeloScan', url: 'https://alfajores.celoscan.io' },
    blockscout: {
      name: 'Blockscout',
      url: 'https://explorer.celo.org/alfajores',
    },
    default: { name: 'CeloScan', url: 'https://alfajores.celoscan.io' },
  },
  testnet: true,
};

export const auroraTestnetChain: Chain = {
  id: 1313161555,
  name: 'Aurora Testnet',
  network: 'auroraTestnet',
  nativeCurrency: {
    decimals: 18,
    name: 'ETH',
    symbol: 'ETH',
  },
  rpcUrls: {
    default: 'https://testnet.aurora.dev',
  },
  blockExplorers: {
    etherscan: {
      name: 'AuroraScan',
      url: 'https://testnet.aurorascan.dev',
    },
    default: {
      name: 'AuroraScan',
      url: 'https://testnet.aurorascan.dev',
    },
  },
  testnet: true,
};

export const moonbeamChain: Chain = {
  id: 1284,
  name: 'Moonbeam',
  network: 'moonbeam',
  nativeCurrency: {
    decimals: 18,
    name: 'GLMR',
    symbol: 'GLMR',
  },
  rpcUrls: {
    default: 'https://rpc.api.moonbeam.network',
  },
  blockExplorers: {
    etherscan: {
      name: 'MoonScan',
      url: 'https://moonscan.io',
    },
    default: {
      name: 'MoonScan',
      url: 'https://moonscan.io',
    },
  },
  testnet: false,
};

export const moonbaseAlphaChain: Chain = {
  id: 1287,
  name: 'Moonbase Alpha',
  network: 'moonbaseAlpha',
  nativeCurrency: {
    decimals: 18,
    name: 'DEV',
    symbol: 'DEV',
  },
  rpcUrls: {
    default: 'https://rpc.api.moonbase.moonbeam.network',
  },
  blockExplorers: {
    etherscan: {
      name: 'MoonScan',
      url: 'https://moonbase.moonscan.io',
    },
    default: {
      name: 'MoonScan',
      url: 'https://moonbase.moonscan.io',
    },
  },
  testnet: true,
};

// SDK uses name, wagmi uses ID, so this maps id to name
// Would be nice to use wagmi's chain 'name' or 'network' prop
// But doesn't match SDK
export const chainIdToName = {
  42161: 'arbitrum',
  421611: 'arbitrumrinkeby',
  1313161555: 'auroratestnet',
  44787: 'alfajores',
  42220: 'celo',
  43114: 'avalanche',
  43113: 'fuji',
  56: 'bsc',
  97: 'bsctestnet',
  1: 'ethereum',
  5: 'goerli',
  42: 'kovan',
  1284: 'moonbeam',
  1287: 'moonbasealpha',
  137: 'polygon',
  80001: 'mumbai',
  10: 'optimism',
  69: 'optimismkovan',
};

// Some block explorers use diff urls for their explorer
// api vs the ui, so setting overrides here
export const chainIdToExplorerApi = {
  42161: 'https://api.arbiscan.io',
  421611: 'https://api-testnet.arbiscan.io',
  42220: 'https://api.celoscan.io',
  44787: 'https://alfajores.celoscan.io',
  43114: 'https://api.snowtrace.io',
  43113: 'https://api-testnet.snowtrace.io',
  56: 'https://api.bscscan.com',
  97: 'https://api-testnet.bscscan.com',
  1: 'https://api.etherscan.io',
  5: 'https://api-goerli.etherscan.io',
  42: 'https://api-kovan.etherscan.io',
  1284: 'https://api-moonbeam.moonscan.io',
  1287: 'https://api-moonbase.moonscan.io',
  137: 'https://api.polygonscan.com',
  80001: 'https://api-testnet.polygonscan.com',
  10: 'https://api-optimistic.etherscan.io',
  69: 'https://api-kovan-optimistic.etherscan.io',
};

export const mainnetChains = [
  chain.mainnet,
  chain.arbitrum,
  chain.optimism,
  chain.polygon,
  avalancheChain,
  bscChain,
  celoMainnetChain,
  moonbeamChain,
];

export const testnetChains = [
  chain.goerli,
  chain.kovan,
  chain.arbitrumGoerli,
  chain.arbitrumRinkeby,
  chain.optimismGoerli,
  chain.optimismKovan,
  chain.polygonMumbai,
  fujiTestnetChain,
  bscTestnetChain,
  celoAlfajoresChain,
  auroraTestnetChain,
  moonbaseAlphaChain,
];

export const prodAndTestChains = [...mainnetChains, ...testnetChains];

export const allChains = [
  ...allChainsWagmi,
  avalancheChain,
  bscChain,
  celoMainnetChain,
  avalancheChain,
  bscChain,
  fujiTestnetChain,
  celoAlfajoresChain,
  bscTestnetChain,
  auroraTestnetChain,
  moonbaseAlphaChain,
];

export const chainIdToChain = allChains.reduce<Record<number, Chain>>((result, chain) => {
  result[chain.id] = chain;
  return result;
}, {});
