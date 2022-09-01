export enum Environment {
  Mainnet = 'mainnet',
  Testnet2 = 'testnet2',
}

// Toggle for testnet2 vs mainnet
const environment: Environment = Environment.Mainnet;
const isDevMode = process?.env?.NODE_ENV === 'development';
const version = process?.env?.NEXT_PUBLIC_VERSION ?? null;

export const allConfigs: Record<Environment, Config> = {
  mainnet: {
    name: 'Abacus Explorer',
    environment: Environment.Mainnet,
    debug: isDevMode,
    version,
    url: 'https://abacus-explorer-app.vercel.app/',
    apiUrl: 'https://abacus-explorer-api.hasura.app/v1/graphql',
  },
  testnet2: {
    name: 'Abacus Testnet Explorer',
    environment: Environment.Testnet2,
    debug: true,
    version,
    url: 'https://abacus-explorer-app.vercel.app/', //TODO
    apiUrl: 'https://abacus-explorer-api.hasura.app/v1/graphql', //TODO
  },
};

export const config = Object.freeze(allConfigs[environment]);

interface Config {
  name: string;
  environment: Environment;
  debug: boolean;
  version: string | null;
  url: string;
  apiUrl: string;
}
