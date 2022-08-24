interface Config {
  name: string;
  debug: boolean;
  version: string | null;
  url: string;
  apiUrl: string;
}

const isDevMode = process?.env?.NODE_ENV === 'development';
const version = process?.env?.NEXT_PUBLIC_VERSION ?? null;

export const config: Config = Object.freeze({
  name: 'Abacus Explorer',
  debug: isDevMode,
  version,
  url: 'https://explorer.useabacus.network',
  apiUrl: 'https://abacus-explorer-api.hasura.app/v1/graphql',
});
