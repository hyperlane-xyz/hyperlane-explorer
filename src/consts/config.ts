const isDevMode = process?.env?.NODE_ENV === 'development';
const version = process?.env?.NEXT_PUBLIC_VERSION ?? null;
const explorerApiKeys = JSON.parse(process?.env?.EXPLORER_API_KEYS || '{}');
export const TENDERLY_USER=process?.env?.TENDERLY_USER
export const TENDERLY_PROJECT=process?.env?.TENDERLY_PROJECT
export const TENDERLY_ACCESS_KEY=process?.env?.TENDERLY_ACCESS_KEY

interface Config {
  debug: boolean;
  version: string | null;
  apiUrl: string;
  explorerApiKeys: Record<string, string>;
}

export const config: Config = Object.freeze({
  debug: isDevMode,
  version,
  apiUrl: 'https://hyperlane-explorer-3.hasura.app/v1/graphql',
  explorerApiKeys,
});
