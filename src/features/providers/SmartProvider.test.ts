import { ChainMetadata, chainMetadata } from '@hyperlane-xyz/sdk';

import { logger } from '../../utils/logger';

import { HyperlaneSmartProvider } from './SmartProvider';

jest.setTimeout(30000);

const MIN_BLOCK_NUM = 8000000;

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
      const firstBlock = await provider.getBlock(1);
      expect(firstBlock.number).toEqual(1);
    });

    // TODO impl tests for all major methods

    // TODO find way to have ethers Request-Rate Exceeded always show
    // so we can test how often it hits throttle
  });
});
