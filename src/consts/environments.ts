// Must match coreEnvironments in SDK
export enum Environment {
  Mainnet = 'mainnet',
  Testnet = 'testnet',
}

export const ENVIRONMENT_BUCKET_SEGMENT: Record<Environment, string> = {
  [Environment.Mainnet]: 'mainnet3',
  [Environment.Testnet]: 'testnet4',
};

// TODO replace with SDK version
export const MAILBOX_VERSION = 3;
