import { BigNumber, providers } from 'ethers';

import { config } from '../consts/config';
import type { LogWithTimestamp } from '../features/messages/queries/types';
import { getMultiProvider } from '../multiProvider';

import { logger } from './logger';
import { fetchWithTimeout, sleep } from './timeout';

const BLOCK_EXPLORER_RATE_LIMIT = 5100; // once every 5.1 seconds
let lastExplorerQuery = 0;

export interface ExplorerQueryResponse<R> {
  status: string;
  message: string;
  result: R;
}

export function getExplorerUrl(chainId: number) {
  return getMultiProvider().tryGetExplorerUrl(chainId);
}

export function getExplorerApiUrl(chainId: number) {
  return getMultiProvider().tryGetExplorerApiUrl(chainId);
}

export function getTxExplorerUrl(chainId: number, hash?: string) {
  if (!hash) return null;
  return getMultiProvider().tryGetExplorerTxUrl(chainId, { hash });
}

export async function queryExplorer<P>(chainId: number, params: URLSearchParams, useKey = true) {
  const baseUrl = getExplorerApiUrl(chainId);
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

  if (!url.searchParams.has('apikey')) {
    // Without an API key, rate limits are strict so enforce a wait if necessary
    const waitTime = BLOCK_EXPLORER_RATE_LIMIT - (Date.now() - lastExplorerQuery);
    if (waitTime > 0) await sleep(waitTime);
  }

  logger.debug('Querying explorer url:', url);
  const result = await executeQuery<P>(url);
  lastExplorerQuery = Date.now();
  return result;
}

async function executeQuery<P>(url: string | URL) {
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
  chainId: number,
  params: string,
  topic0?: string,
  useKey = true,
): Promise<ExplorerLogEntry[]> {
  const logs = await queryExplorer<ExplorerLogEntry[]>(
    chainId,
    new URLSearchParams(params),
    useKey,
  );
  if (!logs || !Array.isArray(logs)) {
    const msg = 'Invalid tx logs result';
    logger.error(msg, JSON.stringify(logs), params);
    throw new Error(msg);
  }
  logs.forEach((l) => validateExplorerLog(l, topic0));
  return logs;
}

export function validateExplorerLog(log: ExplorerLogEntry, topic0?: string) {
  if (!log) throw new Error('Log is nullish');
  if (!log.transactionHash) throw new Error('Log has no tx hash');
  if (!log.topics || !log.topics.length) throw new Error('Log has no topics');
  if (topic0 && log.topics[0]?.toLowerCase() !== topic0) throw new Error('Log topic is incorrect');
  if (!log.data) throw new Error('Log has no data to parse');
  if (!log.timeStamp) throw new Error('Log has no timestamp');
}

export function toProviderLog(log: ExplorerLogEntry): LogWithTimestamp {
  return {
    ...log,
    blockHash: '',
    removed: false,
    blockNumber: BigNumber.from(log.blockNumber).toNumber(),
    transactionIndex: BigNumber.from(log.transactionIndex).toNumber(),
    logIndex: BigNumber.from(log.logIndex).toNumber(),
    timestamp: BigNumber.from(log.timeStamp).toNumber() * 1000,
  };
}

export async function queryExplorerForTx(chainId: number, txHash: string, useKey = true) {
  const params = new URLSearchParams({
    module: 'proxy',
    action: 'eth_getTransactionByHash',
    txHash,
  });
  const tx = await queryExplorer<providers.TransactionResponse>(chainId, params, useKey);
  if (!tx || tx.hash.toLowerCase() !== txHash.toLowerCase()) {
    const msg = 'Invalid tx result';
    logger.error(msg, JSON.stringify(tx), params);
    throw new Error(msg);
  }
  return tx;
}

export async function queryExplorerForTxReceipt(chainId: number, txHash: string, useKey = true) {
  const params = new URLSearchParams({
    module: 'proxy',
    action: 'eth_getTransactionReceipt',
    txHash,
  });
  const tx = await queryExplorer<providers.TransactionReceipt>(chainId, params, useKey);
  if (!tx || tx.transactionHash.toLowerCase() !== txHash.toLowerCase()) {
    const msg = 'Invalid tx result';
    logger.error(msg, JSON.stringify(tx), params);
    throw new Error(msg);
  }
  return tx;
}

export async function queryExplorerForBlock(
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
  const block = await queryExplorer<providers.Block>(chainId, params, useKey);
  if (!block || BigNumber.from(block.number).lte(0)) {
    const msg = 'Invalid block result';
    logger.error(msg, JSON.stringify(block), params);
    throw new Error(msg);
  }
  return block;
}
