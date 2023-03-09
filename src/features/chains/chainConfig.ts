import { z } from 'zod';

import { ChainMetadata, ChainMetadataSchema } from '@hyperlane-xyz/sdk';

import { getMultiProvider } from '../../multiProvider';
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
  const mp = getMultiProvider();
  if (
    mp.tryGetChainMetadata(chainConfig.name) ||
    mp.tryGetChainMetadata(chainConfig.chainId) ||
    (chainConfig.domainId && mp.tryGetChainMetadata(chainConfig.domainId))
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
