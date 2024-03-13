import { ChainMetadata, ExplorerFamily } from '@hyperlane-xyz/sdk';
import { ProtocolType } from '@hyperlane-xyz/utils';

import { tryParseChainConfig } from './chainConfig';

const validConfig: ChainMetadata<{ mailbox: Address }> = {
  chainId: 12345,
  name: 'mytestnet',
  protocol: ProtocolType.Ethereum,
  rpcUrls: [{ http: 'https://fakerpc.com' }],
  blockExplorers: [
    {
      name: 'FakeScan',
      family: ExplorerFamily.Other,
      url: 'https://fakeexplorer.com',
      apiUrl: 'https://fakeexplorer.com',
    },
  ],
  blocks: { confirmations: 1, estimateBlockTime: 10 },
  mailbox: '0x14999bccB37118713891DAAA1D5959a02E206C1f',
};

describe('chain configs', () => {
  it('parses valid config', async () => {
    const result = tryParseChainConfig(JSON.stringify(validConfig));
    expect(result.success).toBe(true);
  });
  it('rejects invalid config', async () => {
    const result = tryParseChainConfig(JSON.stringify({ ...validConfig, chainId: undefined }));
    expect(result.success).toBe(false);
  });
});
