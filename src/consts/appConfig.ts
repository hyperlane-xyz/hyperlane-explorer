const isDevMode = process?.env?.NODE_ENV === 'development';
const version = process?.env?.NEXT_PUBLIC_VERSION ?? null;

interface Config {
  debug: boolean;
  version: string | null;
  url: string;
  apiUrl: string;
}

export const config: Config = Object.freeze({
  debug: isDevMode,
  version,
  url: 'https://explorer.hyperlane.xyz',
  apiUrl: 'https://api.hyperlane.xyz/v1/graphql',
});
