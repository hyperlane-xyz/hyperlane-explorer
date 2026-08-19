const isDevMode = process.env.NODE_ENV === 'development';
const version = process.env.NEXT_PUBLIC_VERSION ?? null;
const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://explorer4.hasura.app/v1/graphql';
const wsUrl = process.env.NEXT_PUBLIC_WS_URL ?? graphqlUrlToWsUrl(apiUrl);
const registryUrl = process.env.NEXT_PUBLIC_REGISTRY_URL || undefined;
const registryBranch = process.env.NEXT_PUBLIC_REGISTRY_BRANCH || 'main';
const explorerApiKeys = JSON.parse(process.env.EXPLORER_API_KEYS || '{}');

interface Config {
  debug: boolean;
  version: string | null;
  apiUrl: string;
  wsUrl: string | null;
  explorerApiKeys: Record<string, string>;
  githubProxy?: string;
  registryUrl: string | undefined; // Optional URL to use a custom registry instead of the published canonical version
  registryBranch?: string | undefined; // Optional customization of the registry branch instead of main
}

export const config: Config = Object.freeze({
  debug: isDevMode,
  version,
  apiUrl,
  wsUrl,
  explorerApiKeys,
  githubProxy: 'https://proxy.hyperlane.xyz',
  registryBranch,
  registryUrl,
});

// Based on https://github.com/hyperlane-xyz/hyperlane-monorepo/blob/main/typescript/infra/config/environments/mainnet3/agent.ts
// Based on https://github.com/hyperlane-xyz/hyperlane-monorepo/blob/main/typescript/infra/config/environments/testnet4/agent.ts
export const unscrapedChainsInDb = ['proteustestnet'];

export const debugIgnoredChains = ['treasure', 'treasuretopaz'];

function graphqlUrlToWsUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    parsed.protocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
    parsed.pathname = '/live';
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return null;
  }
}
