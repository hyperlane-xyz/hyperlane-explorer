// TODO de-dupe this file with widgets lib's utils/explorers.ts
// The widgets lib doesn't export those yet, need to fix that first.
import { BigNumber, providers } from 'ethers';

import { MultiProvider } from '@hyperlane-xyz/sdk';
import { fetchWithTimeout, sleep } from '@hyperlane-xyz/utils';

import { config } from '../consts/config';
import type { ExtendedLog } from '../types';

import { logger } from './logger';
import { toDecimalNumber, tryToDecimalNumber } from './number';

const BLOCK_EXPLORER_RATE_LIMIT = 6000; // once every 6 seconds
// Used for crude rate-limiting of explorer queries without API keys
const hostToLastQueried: Record<string, number> = {};

export interface ExplorerQueryResponse<R> {
  status: string;
  message: string;
  result: R;
}

async function queryExplorer<P>(
  multiProvider: MultiProvider,
  chainName: string,
  params: URLSearchParams,
  useKey = false,
) {
  const baseUrl = multiProvider.tryGetExplorerApiUrl(chainName);
  if (!baseUrl) throw new Error(`No valid URL found for explorer for chain ${chainName}`);

  const url = new URL(baseUrl);
  for (const [key, val] of params.entries()) {
    url.searchParams.set(key, val);
  }

  if (useKey) {
    const apiKey = config.explorerApiKeys[chainName];
    if (!apiKey) throw new Error(`No API key for explorer for chain ${chainName}`);
    url.searchParams.set('apikey', apiKey);
  }

  logger.debug('Querying explorer url:', url.toString());
  return await executeQuery<P>(url);
}

async function executeQuery<P>(url: URL) {
  try {
    if (!url.searchParams.has('apikey')) {
      // Without an API key, rate limits are strict so enforce a wait if necessary
      const lastExplorerQuery = hostToLastQueried[url.hostname] || 0;
      const waitTime = BLOCK_EXPLORER_RATE_LIMIT - (Date.now() - lastExplorerQuery);
      if (waitTime > 0) await sleep(waitTime);
    }

    const response = await fetchWithTimeout(url.toString());
    if (!response.ok) {
      throw new Error(`Fetch response not okay: ${response.status}`);
    }
    const json = (await response.json()) as ExplorerQueryResponse<P>;

    if (!json.result) {
      const responseText = await response.text();
      throw new Error(`Invalid result format: ${responseText}`);
    }

    return json.result;
  } finally {
    hostToLastQueried[url.hostname] = Date.now();
  }
}

export interface ExplorerLogEntry {
  address: string;
  topics: string[];
  data: string;
  blockNumber: string;
  timeStamp: string;
  gasPrice: string;
  gasUsed: string;
  logIndex: string;
  transactionHash: string;
  transactionIndex: string;
}

export async function queryExplorerForLogs(
  multiProvider: MultiProvider,
  chainName: string,
  params: string,
  useKey = false,
): Promise<ExplorerLogEntry[]> {
  const logs = await queryExplorer<ExplorerLogEntry[]>(
    multiProvider,
    chainName,
    new URLSearchParams(params),
    useKey,
  );
  if (!logs || !Array.isArray(logs)) {
    const msg = 'Invalid tx logs result';
    logger.error(msg, JSON.stringify(logs), params);
    throw new Error(msg);
  }
  logs.forEach((l) => validateExplorerLog(l));
  return logs;
}

// TODO use Zod
function validateExplorerLog(log: ExplorerLogEntry) {
  if (!log) throw new Error('Log is nullish');
  if (!log.transactionHash) throw new Error('Log has no tx hash');
  if (!log.topics || !log.topics.length) throw new Error('Log has no topics');
  if (!log.data) throw new Error('Log has no data to parse');
  if (!log.timeStamp) throw new Error('Log has no timestamp');
}

export function toProviderLog(log: ExplorerLogEntry): ExtendedLog {
  return {
    ...log,
    blockHash: '',
    removed: false,
    blockNumber: toDecimalNumber(log.blockNumber),
    timestamp: toDecimalNumber(log.timeStamp) * 1000,
    logIndex: tryToDecimalNumber(log.logIndex) || 0,
    transactionIndex: tryToDecimalNumber(log.transactionIndex) || 0,
  };
}

export async function queryExplorerForTx(
  multiProvider: MultiProvider,
  chainName: string,
  txHash: string,
  useKey = false,
) {
  const params = new URLSearchParams({
    module: 'proxy',
    action: 'eth_getTransactionByHash',
    txHash,
  });
  const tx = await queryExplorer<providers.TransactionResponse>(
    multiProvider,
    chainName,
    params,
    useKey,
  );
  if (!tx || tx.hash.toLowerCase() !== txHash.toLowerCase()) {
    const msg = 'Invalid tx result';
    logger.error(msg, JSON.stringify(tx), params);
    throw new Error(msg);
  }
  return tx;
}

export async function queryExplorerForTxReceipt(
  multiProvider: MultiProvider,
  chainName: string,
  txHash: string,
  useKey = false,
) {
  const params = new URLSearchParams({
    module: 'proxy',
    action: 'eth_getTransactionReceipt',
    txHash,
  });
  const tx = await queryExplorer<providers.TransactionReceipt>(
    multiProvider,
    chainName,
    params,
    useKey,
  );
  if (!tx || tx.transactionHash.toLowerCase() !== txHash.toLowerCase()) {
    const msg = 'Invalid tx result';
    logger.error(msg, JSON.stringify(tx), params);
    throw new Error(msg);
  }
  return tx;
}

export async function queryExplorerForBlock(
  multiProvider: MultiProvider,
  chainName: string,
  blockNumber?: number | string,
  useKey = false,
) {
  const params = new URLSearchParams({
    module: 'proxy',
    action: 'eth_getBlockByNumber',
    tag: blockNumber?.toString() || 'latest',
    boolean: 'false',
  });
  const block = await queryExplorer<providers.Block>(multiProvider, chainName, params, useKey);
  if (!block || BigNumber.from(block.number).lte(0)) {
    const msg = 'Invalid block result';
    logger.error(msg, JSON.stringify(block), params);
    throw new Error(msg);
  }
  return block;
}
