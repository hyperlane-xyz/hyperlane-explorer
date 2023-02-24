import { z } from 'zod';

import { ChainMetadata } from '@hyperlane-xyz/sdk';

import { logger } from '../../utils/logger';

// TODO move to SDK?
// Should match ChainMetadata from SDK
export const chainMetadataSchema = z.object({
  chainId: z.number(),
  domainId: z.number().optional(),
  name: z.string(),
  displayName: z.string().optional(),
  displayNameShort: z.string().optional(),
  nativeToken: z
    .object({
      name: z.string(),
      symbol: z.string(),
      decimals: z.number(),
    })
    .optional(),
  publicRpcUrls: z
    .array(
      z.object({
        http: z.string(),
        webSocket: z.string().optional(),
        pagination: z
          .object({
            blocks: z.number(),
            from: z.number(),
          })
          .optional(),
      }),
    )
    .nonempty(),
  blockExplorers: z.array(
    z.object({
      name: z.string(),
      url: z.string(),
      apiUrl: z.string().optional(),
      family: z.string().optional(),
    }),
  ),
  blocks: z
    .object({
      confirmations: z.number(),
      reorgPeriod: z.number().optional(),
      estimateBlockTime: z.number().optional(),
    })
    .optional(),
  transactionOverrides: z.object({}).optional(),
  gasCurrencyCoinGeckoId: z.string().optional(),
  gnosisSafeTransactionServiceUrl: z.string().optional(),
  isTestnet: z.boolean().optional(),
});

export const chainContractsSchema = z.object({
  mailbox: z.string(),
  multisigIsm: z.string(),
  interchainGasPaymaster: z.string().optional(),
  interchainAccountRouter: z.string().optional(),
});

export const chainConfigSchema = chainMetadataSchema.extend({ contracts: chainContractsSchema });

export type ChainConfig = ChainMetadata & z.infer<typeof chainContractsSchema>;

type ParseResult =
  | {
      success: true;
      chainMetadata: ChainMetadata;
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
  if (result.success) {
    return {
      success: true,
      chainMetadata: result.data as ChainMetadata,
    };
  } else {
    logger.error('Error validating chain config', result.error);
    const firstIssue = result.error.issues[0];
    return {
      success: false,
      error: `${firstIssue.path} => ${firstIssue.message}`,
    };
  }
}
