/** @jest-environment jsdom */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

import type { MessageStub, WarpRouteDetails } from '../../../types';
import { fetchWarpFees, type WarpFeeBreakdown } from './fetchWarpFees';
import { useWarpFees } from './useWarpFees';

jest.mock('../../../store', () => ({
  useReadyMultiProvider: () => mockProvider,
  useMultiProviderVersion: () => 1,
}));
jest.mock('./fetchWarpFees', () => ({ fetchWarpFees: jest.fn() }));

const mockProvider = {};
const route = {
  originToken: { addressOrDenom: `0x${'aa'.repeat(20)}` },
} as WarpRouteDetails;
const first = {
  id: '',
  isPiMsg: true,
  originDomainId: 1,
  msgId: `0x${'11'.repeat(32)}`,
  origin: { hash: `0x${'22'.repeat(32)}` },
} as MessageStub;
const second = {
  ...first,
  msgId: `0x${'33'.repeat(32)}`,
} as MessageStub;
const reactTestGlobal = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

it('isolates PI transfer fees despite empty database IDs and retains each completed result', async () => {
  reactTestGlobal.IS_REACT_ACT_ENVIRONMENT = true;
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const root = createRoot(document.createElement('div'));
  const firstFee = { totalSent: '10', bridgeFee: '1', tokenSymbol: 'TOKEN' };
  const secondFee = { totalSent: '20', bridgeFee: '2', tokenSymbol: 'TOKEN' };
  let resolveSecond: (fee: WarpFeeBreakdown) => void;
  jest
    .mocked(fetchWarpFees)
    .mockResolvedValueOnce(firstFee)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSecond = resolve;
        }),
    );
  let result: WarpFeeBreakdown | null = null;
  function Probe({ message }: { message: MessageStub }) {
    result = useWarpFees(message, route);
    return null;
  }
  const settle = () =>
    act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  const render = async (message: MessageStub) => {
    await act(async () =>
      root.render(
        <QueryClientProvider client={client}>
          <Probe message={message} />
        </QueryClientProvider>,
      ),
    );
    await settle();
  };
  try {
    await render(first);
    expect(result).toEqual(firstFee);
    await render(second);
    expect(result).toBeNull();
    await act(async () => resolveSecond!(secondFee));
    await settle();
    expect(result).toEqual(secondFee);
    await render(first);
    expect(result).toEqual(firstFee);
    expect(fetchWarpFees).toHaveBeenCalledTimes(2);
  } finally {
    await act(async () => root.unmount());
    client.clear();
    delete reactTestGlobal.IS_REACT_ACT_ENVIRONMENT;
  }
});
