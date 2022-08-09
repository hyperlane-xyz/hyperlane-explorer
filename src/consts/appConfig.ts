interface Config {
  name: string;
  debug: boolean;
  version: string | null;
  url: string;
  discordUrl: string;
}

const isDevMode = process?.env?.NODE_ENV === 'development';
const version = process?.env?.NEXT_PUBLIC_VERSION ?? null;

export const config: Config = Object.freeze({
  name: 'Abacus Example NFT App',
  debug: isDevMode,
  version,
  url: 'https://useabacus.network/nft',
  discordUrl: 'https://discord.gg/VK9ZUy3aTV',
});
