import { z } from 'zod';

import { ChainMetadata, ChainMetadataSchemaObject, MultiProvider } from '@hyperlane-xyz/sdk';

import { logger } from '../../utils/logger';

export const ChainConfigSchema = ChainMetadataSchemaObject.extend({
  mailbox: z.string().optional(),
  interchainGasPaymaster: z.string().optional(),
});

export type ChainConfig = ChainMetadata & { mailbox?: Address; interchainGasPaymaster?: Address };

type ParseResult =
  | {
      success: true;
      chainConfig: ChainConfig;
    }
  | {
      success: false;
      error: string;
    };

export function tryParseChainConfig(input: string, mp?: MultiProvider): ParseResult {
  let data: any;
  try {
    data = JSON.parse(input);
  } catch (error) {
    logger.error('Error parsing chain config', error);
    return {
      success: false,
      error: 'Input is not valid JSON',
    };
  }

  const result = ChainConfigSchema.safeParse(data);

  if (!result.success) {
    logger.error('Error validating chain config', result.error);
    const firstIssue = result.error.issues[0];
    return {
      success: false,
      error: `${firstIssue.path} => ${firstIssue.message}`,
    };
  }

  const chainConfig = result.data as ChainConfig;

  // Ensure https is used for RPCs
  const rpcUrls = chainConfig.rpcUrls;
  if (rpcUrls?.some((r) => !r.http.startsWith('https://'))) {
    return {
      success: false,
      error: 'all RPCs must use valid https url',
    };
  }

  // Force blockExplorers family value for now
  const blockExplorers = chainConfig.blockExplorers;
  if (blockExplorers?.some((e) => !e.family)) {
    return {
      success: false,
      error: 'family field for block explorers must be "etherscan"',
    };
  }

  // Reject blockscout explorers for now
  if (blockExplorers?.[0]?.url.includes('blockscout')) {
    return {
      success: false,
      error: 'only Etherscan-based explorers are supported at this time',
    };
  }

  if (
    mp &&
    (mp.tryGetChainMetadata(chainConfig.name) ||
      mp.tryGetChainMetadata(chainConfig.chainId) ||
      (chainConfig.domainId && mp.tryGetChainMetadata(chainConfig.domainId)))
  ) {
    return {
      success: false,
      error: 'chainId, domainId, or name is already in use',
    };
  }

  return {
    success: true,
    chainConfig,
  };
}
