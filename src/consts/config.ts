import { CoreChain } from '@hyperlane-xyz/registry';

const isDevMode = process?.env?.NODE_ENV === 'development';
const version = process?.env?.NEXT_PUBLIC_VERSION ?? null;
const explorerApiKeys = JSON.parse(process?.env?.EXPLORER_API_KEYS || '{}');

interface Config {
  debug: boolean;
  version: string | null;
  apiUrl: string;
  explorerApiKeys: Record<string, string>;
}

export const config: Config = Object.freeze({
  debug: isDevMode,
  version,
  apiUrl: 'https://explorer4.hasura.app/v1/graphql',
  explorerApiKeys,
});

// Based on https://github.com/hyperlane-xyz/hyperlane-monorepo/blob/main/typescript/infra/config/environments/mainnet3/agent.ts
// Based on https://github.com/hyperlane-xyz/hyperlane-monorepo/blob/main/typescript/infra/config/environments/testnet4/agent.ts
export const unscrapedEvmChains = [CoreChain.proteustestnet, CoreChain.sei, CoreChain.viction];
