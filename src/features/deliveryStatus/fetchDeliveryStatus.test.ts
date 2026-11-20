import type { IRegistry } from '@hyperlane-xyz/registry';
import { BigNumber } from 'ethers';

import { MessageStatus, type MessageStub } from '../../types';
import { MessageDebugStatus } from '../debugger/types';
import type { ExplorerMultiProvider } from '../hyperlane/sdkRuntime';
import { checkIsMessageDelivered } from '../messages/deliveryUtils';
import { fetchDeliveryStatus } from './fetchDeliveryStatus';

const mockLoadDebugger = jest.fn();
const mockDebugMessage = jest.fn();
jest.mock('../chains/utils', () => ({
  getMailboxAddress: async () => '0xmailbox',
}));
jest.mock('../debugger/debugMessage', () => {
  mockLoadDebugger();
  return { debugMessage: mockDebugMessage };
});
jest.mock('../messages/deliveryUtils', () => ({
  checkIsMessageDelivered: jest.fn(async () => ({
    isDelivered: true,
    transactionHash: '0xdelivery',
    blockNumber: 100,
  })),
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
    expect(mockLoadDebugger).not.toHaveBeenCalled();
  },
);

it('loads the debugger on a delivery miss and reuses the resolved destination mailbox', async () => {
  jest.mocked(checkIsMessageDelivered).mockResolvedValueOnce({ isDelivered: false });
  const debugResult = { status: MessageDebugStatus.NoErrorsFound, description: 'No errors' };
  mockDebugMessage.mockResolvedValueOnce(debugResult);
  const registry = {} as IRegistry;
  const multiProvider = {
    tryGetChainName: () => 'destination',
  } as unknown as ExplorerMultiProvider;
  const message = { msgId: '0xmessage', destinationDomainId: 2 } as MessageStub;

  await expect(fetchDeliveryStatus(multiProvider, registry, {}, message)).resolves.toEqual({
    status: MessageStatus.Pending,
    debugResult,
  });
  expect(mockLoadDebugger).toHaveBeenCalledTimes(1);
  expect(mockDebugMessage).toHaveBeenCalledWith(multiProvider, registry, '0xmailbox', message);
});
