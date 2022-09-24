export enum Environment {
  Mainnet = 'mainnet',
  Testnet2 = 'testnet2',
}

const isDevMode = process?.env?.NODE_ENV === 'development';
const version = process?.env?.NEXT_PUBLIC_VERSION ?? null;

export const configs: Record<Environment, Config> = {
  mainnet: {
    name: 'Hyperlane Explorer',
    environment: Environment.Mainnet,
    debug: isDevMode,
    version,
    url: 'https://explorer.hyperlane.xyz',
    apiUrl: 'https://abacus-explorer-api.hasura.app/v1/graphql',
  },
  testnet2: {
    name: 'Hyperlane Testnet Explorer',
    environment: Environment.Testnet2,
    debug: true,
    version,
    url: 'https://explorer.hyperlane.xyz',
    apiUrl: 'https://abacus-explorer-api.hasura.app/v1/graphql', // TODO change
  },
};

interface Config {
  name: string;
  environment: Environment;
  debug: boolean;
  version: string | null;
  url: string;
  apiUrl: string;
}
