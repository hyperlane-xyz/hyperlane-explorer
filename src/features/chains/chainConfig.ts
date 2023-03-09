import { z } from 'zod';

import {
  ChainMetadata,
  ChainMetadataSchema,
  chainIdToMetadata as defaultChainIdToMetadata,
} from '@hyperlane-xyz/sdk';

import { logger } from '../../utils/logger';

export const chainContractsSchema = z.object({
  mailbox: z.string(),
  multisigIsm: z.string().optional(),
  // interchainGasPaymaster: z.string().optional(),
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

export function tryParseChainConfig(input: string): ParseResult {
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
  if (defaultChainIdToMetadata[chainConfig.chainId]) {
    return {
      success: false,
      error: 'Chain ID already included in explorer defaults',
    };
  }

  return {
    success: true,
    chainConfig,
  };
}
