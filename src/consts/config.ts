import { logger } from '../utils/logger';

const isDevMode = process.env.NODE_ENV === 'development';
const version = process.env.NEXT_PUBLIC_VERSION ?? null;
const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://explorer-api.hyperlane.xyz/graphql';
const wsUrl = resolveWsUrl(process.env.NEXT_PUBLIC_WS_URL, apiUrl);
const registryUrl = process.env.NEXT_PUBLIC_REGISTRY_URL || undefined;
const registryBranch = process.env.NEXT_PUBLIC_REGISTRY_BRANCH || 'main';
const walletConnectProjectId = process.env.NEXT_PUBLIC_WALLET_CONNECT_ID || '';
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
  walletConnectProjectId: string;
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
  walletConnectProjectId,
});

// Based on https://github.com/hyperlane-xyz/hyperlane-monorepo/blob/main/typescript/infra/config/environments/mainnet3/agent.ts
// Based on https://github.com/hyperlane-xyz/hyperlane-monorepo/blob/main/typescript/infra/config/environments/testnet4/agent.ts
export const unscrapedChainsInDb = ['proteustestnet'];

export const debugIgnoredChains = ['treasure', 'treasuretopaz'];

export function resolveWsUrl(override: string | undefined, graphqlUrl: string): string | null {
  const normalizedOverride = override?.trim() || undefined;
  const url = normalizedOverride ?? graphqlUrl;
  try {
    const parsed = new URL(url);
    if (normalizedOverride) {
      if (!['ws:', 'wss:'].includes(parsed.protocol) || parsed.hash) {
        throw new Error('NEXT_PUBLIC_WS_URL must use ws/wss and must not contain a fragment');
      }
    } else {
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new Error('NEXT_PUBLIC_API_URL must use http/https');
      }
      parsed.protocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
      parsed.pathname = '/messages';
      parsed.search = '';
      parsed.hash = '';
    }
    return parsed.toString();
  } catch (error) {
    logger.error('Invalid Explorer websocket configuration', error);
    return null;
  }
}
