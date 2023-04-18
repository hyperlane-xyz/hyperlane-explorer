import { z } from 'zod';

import { ChainMetadata, ChainMetadataSchema, MultiProvider } from '@hyperlane-xyz/sdk';

import { logger } from '../../utils/logger';

export const chainContractsSchema = z.object({
  mailbox: z.string(),
  interchainSecurityModule: z.string().optional(),
  interchainGasPaymaster: z.string().optional(),
  // interchainAccountRouter: z.string().optional(),
});

export type ChainConfig = ChainMetadata & { contracts: z.infer<typeof chainContractsSchema> };
export const chainConfigSchema = ChainMetadataSchema.extend({
  contracts: chainContractsSchema,
});

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

  const result = chainConfigSchema.safeParse(data);

  if (!result.success) {
    logger.error('Error validating chain config', result.error);
    const firstIssue = result.error.issues[0];
    return {
      success: false,
      error: `${firstIssue.path} => ${firstIssue.message}`,
    };
  }

  const chainConfig = result.data as ChainConfig;

  // Reject blockscout explorers for now
  if (chainConfig.blockExplorers?.[0]?.url.includes('blockscout')) {
    return {
      success: false,
      error: 'only Etherscan-based explorers are supported',
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
      error: 'chainId, name, or domainId is already in use',
    };
  }

  return {
    success: true,
    chainConfig,
  };
}
