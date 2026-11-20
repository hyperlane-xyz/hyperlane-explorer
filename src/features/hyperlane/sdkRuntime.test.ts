import { metadata as ethereum } from '@hyperlane-xyz/registry/chains/ethereum/metadata.js';
import { metadata as tron } from '@hyperlane-xyz/registry/chains/tron/metadata.js';
import { metadata as zksync } from '@hyperlane-xyz/registry/chains/zksync/metadata.js';
import { MinimalProviderRegistry } from '@hyperlane-xyz/sdk/providers/MinimalProviderRegistry';
import { ProviderType } from '@hyperlane-xyz/sdk/providers/ProviderType';
import { TokenStandard } from '@hyperlane-xyz/sdk/token/TokenStandard';
import { BigNumber, providers } from 'ethers';

import { ExplorerMultiProvider } from './sdkRuntime';

afterEach(() => jest.restoreAllMocks());

test('selects the ZkSync default and preserves explicit provider types', () => {
  const runtime = new ExplorerMultiProvider({ ethereum, tron, zksync });
  const readProvider = jest
    .spyOn(MinimalProviderRegistry.prototype, 'tryGetProvider')
    .mockReturnValue(null);

  runtime.tryGetProvider('zksync');
  runtime.tryGetProvider('zksync', ProviderType.EthersV5);
  runtime.tryGetProvider('tron', ProviderType.Tron);
  runtime.tryGetProvider('ethereum');

  expect(readProvider.mock.calls).toEqual([
    ['zksync', ProviderType.ZkSync],
    ['zksync', ProviderType.EthersV5],
    ['tron', ProviderType.Tron],
    ['ethereum', undefined],
  ]);
});

test('runs a lazy EVM token adapter with the configured Ethers provider', async () => {
  const address = '0x' + '11'.repeat(20);
  const provider = new providers.JsonRpcProvider(undefined, { chainId: 1, name: 'ethereum' });
  const getBalance = jest.spyOn(provider, 'getBalance').mockResolvedValue(BigNumber.from(3));
  const runtime = new ExplorerMultiProvider({ ethereum });
  runtime.setProvider('ethereum', { type: ProviderType.EthersV5, provider });

  const adapter = await runtime.createEvmTokenAdapter({
    chainName: 'ethereum',
    addressOrDenom: address,
    standard: TokenStandard.EvmHypNative,
  });

  await expect(adapter?.getBalance(address)).resolves.toBe(3n);
  expect(getBalance).toHaveBeenCalledWith(address);
});
