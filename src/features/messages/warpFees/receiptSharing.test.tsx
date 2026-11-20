/**
 * @jest-environment jsdom
 * @jest-environment-options {"customExportConditions":["node","node-addons"]}
 */
import { TokenStandard } from '@hyperlane-xyz/sdk/token/TokenStandard';
import { ProtocolType } from '@hyperlane-xyz/utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { utils } from 'ethers';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

import type { MessageStub, WarpRouteDetails } from '../../../types';
import { useIgpPayments } from '../cards/useIgpPayments';
import { IgpPaymentsStatus } from '../igpPayments';
import { useWarpFees } from './useWarpFees';

jest.mock('@hyperlane-xyz/utils', () => {
  const { TextEncoder, TextDecoder } = jest.requireActual('node:util');
  Object.assign(globalThis, { TextEncoder, TextDecoder, fetch: jest.fn() });
  return jest.requireActual('@hyperlane-xyz/utils');
});
jest.mock('../../../metadataStore', () => ({
  useChainMetadataReady: () => true,
  useChainMetadataResolver: () => mockMultiProvider,
  useStore: (selector: (state: object) => unknown) => selector({}),
}));
jest.mock('../../../store', () => ({
  useMultiProviderInitFailed: () => false,
  useMultiProviderVersion: () => 1,
  useReadyMultiProvider: () => mockMultiProvider,
}));

const mockGetReceipt = jest.fn();
const mockMultiProvider = {
  getEthersV5Provider: () => ({ getTransactionReceipt: mockGetReceipt }),
  tryGetChainMetadata: () => ({ protocol: ProtocolType.Ethereum }),
  tryGetChainName: () => 'ethereum',
  tryGetProtocol: () => ProtocolType.Ethereum,
};
const message = {
  originDomainId: 1,
  msgId: `0x${'11'.repeat(32)}`,
  origin: { hash: `0x${'22'.repeat(32)}` },
} as MessageStub;
const originToken = {
  chainName: 'ethereum',
  name: 'Token',
  symbol: 'TOKEN',
  standard: TokenStandard.EvmHypCollateral,
  addressOrDenom: `0x${'aa'.repeat(20)}`,
  decimals: 18,
};
const route: WarpRouteDetails = {
  originToken,
  destinationToken: { ...originToken, chainName: 'optimism' },
  amount: '1',
  wireAmount: '1000000000000000000',
  destAmount: '1',
  transferRecipient: `0x${'bb'.repeat(20)}`,
};
const logs = [
  eventLog(
    'Transfer(address indexed from, address indexed to, uint256 value)',
    originToken.addressOrDenom,
    [route.transferRecipient, originToken.addressOrDenom, utils.parseEther('1.1')],
  ),
  eventLog(
    'SentTransferRemote(uint32 indexed destination, bytes32 indexed recipient, uint256 amountOrId)',
    originToken.addressOrDenom,
    [10, utils.hexZeroPad(route.transferRecipient, 32), utils.parseEther('1')],
  ),
  eventLog('DispatchId(bytes32 indexed messageId)', `0x${'cc'.repeat(20)}`, [message.msgId]),
  eventLog(
    'GasPayment(bytes32 indexed messageId, uint32 indexed destinationDomain, uint256 gasAmount, uint256 payment)',
    `0x${'dd'.repeat(20)}`,
    [message.msgId, 10, 100, 123],
  ),
];

function eventLog(signature: string, address: string, values: unknown[]) {
  const abi = new utils.Interface([`event ${signature}`]);
  return { address, ...abi.encodeEventLog(Object.values(abi.events)[0], values) };
}

it.each([
  { name: 'generic message', hasWarp: false, delayedFee: false, retryReceipt: false },
  { name: 'Warp transfer', hasWarp: true, delayedFee: false, retryReceipt: false },
  { name: 'late Warp fee panel', hasWarp: true, delayedFee: true, retryReceipt: false },
  { name: 'missing receipt retry', hasWarp: true, delayedFee: false, retryReceipt: true },
])(
  'shares origin receipt reads and preserves parsed values for $name',
  async ({ hasWarp, delayedFee, retryReceipt }) => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    mockGetReceipt.mockReset().mockResolvedValue({ logs });
    if (retryReceipt) mockGetReceipt.mockResolvedValueOnce(null);
    const client = new QueryClient({ defaultOptions: { queries: { retry: 1, retryDelay: 0 } } });
    const container = document.createElement('div');
    const root = createRoot(container);
    function Probe({ showFee }: { showFee: boolean }) {
      const fee = useWarpFees(message, showFee ? route : undefined);
      const { status, payments } = useIgpPayments(message, true);
      return <output>{`${status}/${payments?.[0]?.paymentAmount}/${fee?.bridgeFee}`}</output>;
    }
    async function render(showFee: boolean) {
      const expected = `${IgpPaymentsStatus.Ready}/123/${showFee ? '0.1' : undefined}`;
      await act(async () =>
        root.render(
          <QueryClientProvider client={client}>
            <Probe showFee={showFee} />
          </QueryClientProvider>,
        ),
      );
      for (let i = 0; i < 20 && container.textContent !== expected; i++) {
        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 0));
        });
      }
      expect(container.textContent).toBe(expected);
    }
    try {
      await render(hasWarp && !delayedFee);
      if (delayedFee) await render(true);
      expect(mockGetReceipt).toHaveBeenCalledTimes(retryReceipt ? 2 : 1);
    } finally {
      await act(async () => root.unmount());
      client.clear();
      Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
    }
  },
);
