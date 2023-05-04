import { BigNumber } from 'ethers';
import type { NextApiRequest, NextApiResponse } from 'next';
import NextCors from 'nextjs-cors';

import { MultiProvider, chainIdToMetadata } from '@hyperlane-xyz/sdk';

import { Environment } from '../../consts/environments';
import { getChainEnvironment } from '../../features/chains/utils';
import { logger } from '../../utils/logger';
import { fetchWithTimeout } from '../../utils/timeout';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<{ nonce: number } | string>,
) {
  await NextCors(req, res, {
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE'],
    origin: '*',
    optionsSuccessStatus: 200,
  });
  try {
    const body = req.body as { chainId: ChainId };
    if (!body.chainId) throw new Error('No chainId in body');
    // TODO PI support here
    if (!chainIdToMetadata[body.chainId]) throw new Error('ChainId is unsupported');
    const multiProvider = new MultiProvider();
    const nonce = await fetchLatestNonce(multiProvider, body.chainId);
    res.status(200).json({ nonce });
  } catch (error) {
    const msg = 'Unable to fetch latest index';
    logger.error(msg, error);
    res.status(500).send(msg);
  }
}

async function fetchLatestNonce(multiProvider: MultiProvider, chainId: ChainId) {
  logger.debug(`Attempting to fetch nonce for:`, chainId);
  const url = getS3BucketUrl(multiProvider, chainId);
  logger.debug(`Querying bucket:`, url);
  const response = await fetchWithTimeout(url, undefined, 3000);
  const text = await response.text();
  const nonce = BigNumber.from(text).toNumber();
  logger.debug(`Found nonce:`, nonce);
  return nonce;
}

// Partly copied from https://github.com/hyperlane-xyz/hyperlane-monorepo/blob/1fc65f3b7f31f86722204a9de08506f212720a52/typescript/infra/config/environments/mainnet/validators.ts#L12
function getS3BucketUrl(multiProvider: MultiProvider, chainId: ChainId) {
  const chainName = multiProvider.getChainName(chainId);
  const environment =
    getChainEnvironment(multiProvider, chainId) === Environment.Mainnet ? 'mainnet2' : 'testnet3';
  const bucketName = `hyperlane-${environment}-${chainName}-validator-0`;
  return `https://${bucketName}.s3.us-east-1.amazonaws.com/checkpoint_latest_index.json`;
}

export const config = {
  api: {
    responseLimit: '1kb',
    bodyParser: {
      sizeLimit: '1kb',
    },
  },
};
