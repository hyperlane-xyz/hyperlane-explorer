import { ethers } from 'ethers';

import { ChainMetadata, chainMetadata } from '@hyperlane-xyz/sdk';

import { areAddressesEqual } from '../../utils/addresses';
import { logger } from '../../utils/logger';

import { HyperlaneSmartProvider } from './SmartProvider';

jest.setTimeout(30000);

const MIN_BLOCK_NUM = 8000000;
const DEFAULT_ACCOUNT = '0x4f7A67464B5976d7547c860109e4432d50AfB38e';
const WETH_CONTRACT = '0xb4fbf271143f4fbf7b91a5ded31805e42b2208d6';
const WETH_TRANSFER_TOPIC0 = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const TRANSFER_TX_HASH = '0x45a586f90ffd5d0f8e618f0f3703b14c2c9e4611af6231d6fed32c62776b6c1b';

describe('SmartProvider', () => {
  let config: ChainMetadata;
  let provider: HyperlaneSmartProvider;

  describe('Just Etherscan', () => {
    beforeAll(() => {
      config = { ...chainMetadata.goerli };
      config.publicRpcUrls = [];
      provider = new HyperlaneSmartProvider(config);
    });

    it('Fetches blocks', async () => {
      const latestBlock = await provider.getBlock('latest');
      logger.debug('Latest block #', latestBlock.number);
      expect(latestBlock.number).toBeGreaterThan(MIN_BLOCK_NUM);
      expect(latestBlock.timestamp).toBeGreaterThan(Date.now() / 1000 - 60 * 60 * 24);
      const firstBlock = await provider.getBlock(1);
      expect(firstBlock.number).toEqual(1);
    });

    it('Fetches block number', async () => {
      const result = await provider.getBlockNumber();
      logger.debug('Latest block #', result);
      expect(result).toBeGreaterThan(MIN_BLOCK_NUM);
    });

    it('Fetches gas price', async () => {
      const result = await provider.getGasPrice();
      logger.debug('Gas price', result.toString());
      expect(result.toNumber()).toBeGreaterThan(0);
    });

    it('Fetches account balance', async () => {
      const result = await provider.getBalance(DEFAULT_ACCOUNT);
      logger.debug('Balance', result.toString());
      expect(parseFloat(ethers.utils.formatEther(result))).toBeGreaterThan(1);
    });

    it('Fetches code', async () => {
      const result = await provider.getCode(WETH_CONTRACT);
      logger.debug('Weth code snippet', result.substring(0, 12));
      expect(result.length).toBeGreaterThan(100);
    });

    it('Fetches storage at location', async () => {
      const result = await provider.getStorageAt(WETH_CONTRACT, 0);
      logger.debug('Weth storage', result);
      expect(result.length).toBeGreaterThan(20);
    });

    it('Fetches transaction count', async () => {
      const result = await provider.getTransactionCount(DEFAULT_ACCOUNT, 'latest');
      logger.debug('Tx Count', result);
      expect(result).toBeGreaterThan(40);
    });

    it('Fetches transaction by hash', async () => {
      const result = await provider.getTransaction(TRANSFER_TX_HASH);
      logger.debug('Transaction confirmations', result.confirmations);
      expect(result.confirmations).toBeGreaterThan(1000);
    });

    it('Fetches transaction receipt', async () => {
      const result = await provider.getTransactionReceipt(TRANSFER_TX_HASH);
      logger.debug('Transaction receipt', result.confirmations);
      expect(result.confirmations).toBeGreaterThan(1000);
    });

    it('Fetches logs', async () => {
      const result = await provider.getLogs({
        address: WETH_CONTRACT,
        topics: [WETH_TRANSFER_TOPIC0],
      });
      logger.debug('Logs found', result.length);
      expect(result.length).toBeGreaterThan(100);
      expect(areAddressesEqual(result[0].address, WETH_CONTRACT)).toBeTruthy();
    });

    //TODO
    it.skip('Estimates gas', async () => {
      try {
        const result = await provider.estimateGas({ to: DEFAULT_ACCOUNT, value: 1 });
        expect('Provider should throw').toStrictEqual(true);
      } catch (error) {
        expect(error).toBe('TODO');
      }
    });

    //TODO
    it.skip('Sends transaction', async () => {
      try {
        const result = await provider.sendTransaction('0x1234');
        expect('Provider should throw').toStrictEqual(true);
      } catch (error) {
        expect(error).toBe('TODO');
      }
    });

    it.skip('Performs eth_call', async () => {
      //TODO
    });

    // TODO find way to have ethers Request-Rate Exceeded always show
    // so we can test how often it hits throttle
  });
});
