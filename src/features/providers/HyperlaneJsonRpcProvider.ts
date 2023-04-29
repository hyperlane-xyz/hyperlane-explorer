import { BigNumber, providers } from 'ethers';

import { logger } from '../../utils/logger';
import { isBigNumberish } from '../../utils/number';
import { chunk } from '../../utils/string';
import { isNullish } from '../../utils/typeof';

import { AllProviderMethods, IProviderMethods, ProviderMethod } from './ProviderMethods';
import { RpcConfigWithConnectionInfo } from './types';

const NUM_LOG_BLOCK_RANGES_TO_QUERY = 10;
const NUM_PARALLEL_LOG_QUERIES = 5;

export class HyperlaneJsonRpcProvider
  extends providers.StaticJsonRpcProvider
  implements IProviderMethods
{
  public readonly supportedMethods = AllProviderMethods;

  constructor(public readonly rpcConfig: RpcConfigWithConnectionInfo, network: providers.Network) {
    super(rpcConfig.connection ?? rpcConfig.http, network);
  }

  async perform(method: string, params: any): Promise<any> {
    logger.debug('HyperlaneJsonRpcProvider performing method:', method);
    if (method === ProviderMethod.GetLogs) {
      return this.performGetLogs(params);
    } else {
      return super.perform(method, params);
    }
  }

  async performGetLogs(params: { filter: providers.Filter }) {
    const deferToSuper = () => super.perform(ProviderMethod.GetLogs, params);

    const paginationOptions = this.rpcConfig.pagination;
    if (!paginationOptions || !params.filter) return deferToSuper();

    const { fromBlock, toBlock, address, topics } = params.filter;
    // TODO update when sdk is updated
    const { blocks: maxBlockRange, from: minBlockNumber } = paginationOptions;

    if (!maxBlockRange && isNullish(minBlockNumber)) return deferToSuper();

    const currentBlockNumber = await super.perform(ProviderMethod.GetBlockNumber, null);

    let endBlock: number;
    if (isNullish(toBlock) || toBlock === 'latest') {
      endBlock = currentBlockNumber;
    } else if (isBigNumberish(toBlock)) {
      endBlock = BigNumber.from(toBlock).toNumber();
    } else {
      return deferToSuper();
    }

    const minQueryable = maxBlockRange
      ? endBlock - maxBlockRange * NUM_LOG_BLOCK_RANGES_TO_QUERY + 1
      : 0;

    let startBlock: number;
    if (fromBlock === 'earliest') {
      startBlock = 0;
    } else if (isBigNumberish(fromBlock)) {
      startBlock = BigNumber.from(fromBlock).toNumber();
    } else if (isNullish(fromBlock)) {
      startBlock = Math.max(minQueryable, minBlockNumber ?? 0);
    } else {
      return deferToSuper();
    }

    if (startBlock >= endBlock)
      throw new Error(`Invalid range ${startBlock} - ${endBlock}: start >= end`);
    if (minBlockNumber && startBlock < minBlockNumber)
      throw new Error(`Invalid start ${startBlock}: below rpc minBlockNumber ${minBlockNumber}`);
    if (startBlock < minQueryable) {
      throw new Error(`Invalid range ${startBlock} - ${endBlock}: requires too many queries`);
    }

    const blockChunkRange = maxBlockRange || endBlock - startBlock;
    const blockChunks: [number, number][] = [];
    for (let from = startBlock; from <= endBlock; from += blockChunkRange) {
      const to = Math.min(from + blockChunkRange - 1, endBlock);
      blockChunks.push([from, to]);
    }

    let combinedResults: Array<providers.Log> = [];
    const requestChunks = chunk(blockChunks, NUM_PARALLEL_LOG_QUERIES);
    for (const reqChunk of requestChunks) {
      const resultPromises = reqChunk.map(
        (blockChunk) =>
          super.perform(ProviderMethod.GetLogs, {
            filter: {
              address,
              topics,
              fromBlock: BigNumber.from(blockChunk[0]).toHexString(),
              toBlock: BigNumber.from(blockChunk[1]).toHexString(),
            },
          }) as Promise<Array<providers.Log>>,
      );
      const results = await Promise.all(resultPromises);
      combinedResults = [...combinedResults, ...results.flat()];
    }

    return combinedResults;
  }

  getBaseUrl(): string {
    return this.connection.url;
  }
}
