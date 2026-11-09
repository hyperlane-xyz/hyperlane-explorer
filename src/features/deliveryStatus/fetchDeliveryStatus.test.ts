import type { IRegistry } from '@hyperlane-xyz/registry';
import { BigNumber } from 'ethers';

import { MessageStatus, type MessageStub } from '../../types';
import type { ExplorerMultiProvider } from '../hyperlane/sdkRuntime';
import { fetchDeliveryStatus } from './fetchDeliveryStatus';

jest.mock('../chains/utils', () => ({
  getMailboxAddress: async () => '0xmailbox',
}));
jest.mock('../debugger/debugMessage', () => ({ debugMessage: jest.fn() }));
jest.mock('../messages/deliveryUtils', () => ({
  checkIsMessageDelivered: async () => ({
    isDelivered: true,
    transactionHash: '0xdelivery',
    blockNumber: 100,
  }),
}));

it.each([{ gasLimit: BigNumber.from(500_000), gasPrice: BigNumber.from(2_000_000_000) }, null])(
  'does not claim transaction limits or missing values as actual execution gas',
  async (tx) => {
    const provider = {
      getTransaction: jest.fn(async () => tx),
      getBlock: jest.fn(async () => ({ timestamp: 1_700_000_000 })),
    };
    const multiProvider = {
      tryGetChainName: () => 'destination',
      getEthersV5Provider: () => provider,
    } as unknown as ExplorerMultiProvider;
    const result = await fetchDeliveryStatus(multiProvider, {} as IRegistry, {}, {
      msgId: '0xmessage',
      destinationDomainId: 2,
      isPiMsg: true,
    } as MessageStub);

    expect(result.status).toBe(MessageStatus.Delivered);
    if (result.status !== MessageStatus.Delivered) throw new Error('Expected delivered message');
    expect(result.deliveryTransaction).toMatchObject({
      hash: '0xdelivery',
      blockNumber: 100,
      timestamp: 1_700_000_000_000,
    });
    expect(result.deliveryTransaction).not.toHaveProperty('gasUsed');
    expect(result.deliveryTransaction).not.toHaveProperty('effectiveGasPrice');
    expect(result.deliveryTransaction).not.toHaveProperty('cumulativeGasUsed');
  },
);
