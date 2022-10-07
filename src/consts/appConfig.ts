import { Environment } from './environments';

const isDevMode = process?.env?.NODE_ENV === 'development';
const version = process?.env?.NEXT_PUBLIC_VERSION ?? null;

export const configs: Record<Environment, Config> = {
  mainnet: {
    environment: Environment.Mainnet,
    debug: isDevMode,
    version,
    url: 'https://explorer.hyperlane.xyz',
    apiUrl: 'https://api.hyperlane.xyz/v1/graphql',
  },
  testnet2: {
    environment: Environment.Testnet2,
    debug: true,
    version,
    url: 'https://explorer.hyperlane.xyz',
    apiUrl: 'https://api.hyperlane.xyz/v1/graphql',
  },
};

interface Config {
  environment: Environment;
  debug: boolean;
  version: string | null;
  url: string;
  apiUrl: string;
}
