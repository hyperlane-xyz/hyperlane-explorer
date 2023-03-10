import { BigNumber, providers } from 'ethers';

import { MultiProvider } from '@hyperlane-xyz/sdk';

import { config } from '../consts/config';
import type { LogWithTimestamp } from '../features/messages/queries/types';

import { logger } from './logger';
import { hexToDecimal, tryHexToDecimal } from './number';
import { fetchWithTimeout, sleep } from './timeout';

const BLOCK_EXPLORER_RATE_LIMIT = 5100; // once every 5.1 seconds
let lastExplorerQuery = 0;

export interface ExplorerQueryResponse<R> {
  status: string;
  message: string;
  result: R;
}

async function queryExplorer<P>(
  multiProvider: MultiProvider,
  chainId: number,
  params: URLSearchParams,
  useKey = true,
) {
  const baseUrl = multiProvider.tryGetExplorerApiUrl(chainId);
  if (!baseUrl) throw new Error(`No valid URL found for explorer for chain ${chainId}`);

  const url = new URL(baseUrl);
  for (const [key, val] of params.entries()) {
    url.searchParams.set(key, val);
  }

  if (useKey) {
    const apiKey = config.explorerApiKeys[chainId];
    if (!apiKey) throw new Error(`No API key for explorer for chain ${chainId}`);
    url.searchParams.set('apikey', apiKey);
  }

  logger.debug('Querying explorer url:', url.toString());
  const result = await executeQuery<P>(url);
  lastExplorerQuery = Date.now();
  return result;
}

async function executeQuery<P>(url: URL) {
  try {
    if (!url.searchParams.has('apikey')) {
      // Without an API key, rate limits are strict so enforce a wait if necessary
      const waitTime = BLOCK_EXPLORER_RATE_LIMIT - (Date.now() - lastExplorerQuery);
      if (waitTime > 0) await sleep(waitTime);
    }

    const response = await fetchWithTimeout(url);
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
    lastExplorerQuery = Date.now();
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
  chainId: number,
  params: string,
  useKey = true,
): Promise<ExplorerLogEntry[]> {
  const logs = await queryExplorer<ExplorerLogEntry[]>(
    multiProvider,
    chainId,
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

function validateExplorerLog(log: ExplorerLogEntry) {
  if (!log) throw new Error('Log is nullish');
  if (!log.transactionHash) throw new Error('Log has no tx hash');
  if (!log.topics || !log.topics.length) throw new Error('Log has no topics');
  if (!log.data) throw new Error('Log has no data to parse');
  if (!log.timeStamp) throw new Error('Log has no timestamp');
}

export function toProviderLog(log: ExplorerLogEntry): LogWithTimestamp {
  return {
    ...log,
    blockHash: '',
    removed: false,
    blockNumber: hexToDecimal(log.blockNumber),
    timestamp: hexToDecimal(log.timeStamp) * 1000,
    logIndex: tryHexToDecimal(log.logIndex) || 0,
    transactionIndex: tryHexToDecimal(log.transactionIndex) || 0,
  };
}

export async function queryExplorerForTx(
  multiProvider: MultiProvider,
  chainId: number,
  txHash: string,
  useKey = true,
) {
  const params = new URLSearchParams({
    module: 'proxy',
    action: 'eth_getTransactionByHash',
    txHash,
  });
  const tx = await queryExplorer<providers.TransactionResponse>(
    multiProvider,
    chainId,
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
  chainId: number,
  txHash: string,
  useKey = true,
) {
  const params = new URLSearchParams({
    module: 'proxy',
    action: 'eth_getTransactionReceipt',
    txHash,
  });
  const tx = await queryExplorer<providers.TransactionReceipt>(
    multiProvider,
    chainId,
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
  chainId: number,
  blockNumber?: number | string,
  useKey = true,
) {
  const params = new URLSearchParams({
    module: 'proxy',
    action: 'eth_getBlockByNumber',
    tag: blockNumber?.toString() || 'latest',
    boolean: 'false',
  });
  const block = await queryExplorer<providers.Block>(multiProvider, chainId, params, useKey);
  if (!block || BigNumber.from(block.number).lte(0)) {
    const msg = 'Invalid block result';
    logger.error(msg, JSON.stringify(block), params);
    throw new Error(msg);
  }
  return block;
}
