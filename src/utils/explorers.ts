import { chainIdToChain } from '../consts/chains';

import { retryAsync } from './retry';
import { fetchWithTimeout } from './timeout';

export interface ExplorerQueryResponse<R> {
  status: string;
  message: string;
  result: R;
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

export function getExplorerUrl(chainId: number) {
  if (!chainId) return null;

  const chain = chainIdToChain[chainId];
  if (!chain?.blockExplorers) return null;

  if (chain.blockExplorers.etherscan) {
    return chain.blockExplorers.etherscan.url;
  }
  if (chain.blockExplorers.default) {
    return chain.blockExplorers.default.url;
  }
  return null;
}

export function getTxExplorerUrl(chainId: number, hash?: string) {
  const baseUrl = getExplorerUrl(chainId);
  if (!hash || !baseUrl) return null;
  return `${baseUrl}/tx/${hash}`;
}

export async function queryExplorer<P>(url: string) {
  const result = await retryAsync(() => executeQuery<P>(url), 2, 1000);
  return result;
}

async function executeQuery<P>(url: string) {
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

export async function queryExplorerForLogs(url: string, topic0?: string) {
  const logs = await queryExplorer<ExplorerLogEntry[]>(url);
  if (!logs || !Array.isArray(logs)) return [];
  logs.forEach((l) => validateExplorerLog(l, topic0));
  return logs;
}

function validateExplorerLog(log: ExplorerLogEntry, topic0?: string) {
  if (!log) throw new Error('Log is nullish');
  if (!log.transactionHash) throw new Error('Log has no tx hash');
  if (!log.topics || !log.topics.length) throw new Error('Log has no topics');
  if (topic0 && log.topics[0]?.toLowerCase() !== topic0) throw new Error('Log topic is incorrect');
  if (!log.data) throw new Error('Log has no data to parse');
  if (!log.timeStamp) throw new Error('Log has no timestamp');
}
