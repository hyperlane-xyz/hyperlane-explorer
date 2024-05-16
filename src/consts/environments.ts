// Must match coreEnvironments in SDK
export enum Environment {
  Mainnet = 'mainnet',
  Testnet = 'testnet',
}

export const ENVIRONMENT_BUCKET_SEGMENT: Record<Environment, string> = {
  [Environment.Mainnet]: 'mainnet3',
  [Environment.Testnet]: 'testnet4',
};
