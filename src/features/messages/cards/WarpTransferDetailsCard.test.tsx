import type { TokenArgs } from '@hyperlane-xyz/sdk';
import { TokenStandard } from '@hyperlane-xyz/sdk/token/TokenStandard';
import { renderToStaticMarkup } from 'react-dom/server';

import { MessageStatus, type MessageStub, type WarpRouteDetails } from '../../../types';
import { useWarpRouteBalances } from '../warpVisualization/useWarpRouteBalances';
import { useTokenUsdPrices } from './useNativeTokenUsdPrice';
import { WarpTransferDetails } from './WarpTransferDetailsCard';

jest.mock('@hyperlane-xyz/widgets', () => ({
  ArrowIcon: () => null,
  ChevronIcon: () => null,
  CopyButton: () => null,
  RefreshIcon: () => null,
  Tooltip: () => null,
}));
jest.mock('../../../components/icons/ChainLogo', () => ({ ChainLogo: () => null }));
jest.mock('../../../components/icons/TokenIcon', () => ({ TokenIcon: () => null }));
jest.mock('../../../components/layout/SectionCard', () => ({ SectionCard: () => null }));
let mockIsTestnet = false;
jest.mock('../../../metadataStore', () => ({
  useRegistry: () => ({ getUri: (path: string) => `https://example.com/${path}` }),
  useChainMetadataResolver: () => ({
    tryGetChainMetadata: () => ({ protocol: 'ethereum', isTestnet: mockIsTestnet }),
  }),
}));
jest.mock('../../../utils/url', () => ({
  getBlockExplorerAddressUrl: (_resolver: unknown, _chain: unknown, address: string) =>
    `https://example.com/address/${address}`,
}));
jest.mock('../../chains/utils', () => ({
  getChainDisplayName: (_resolver: unknown, chain: string) => chain,
}));
jest.mock('../warpVisualization/useWarpRouteVisualization', () => ({
  useWarpRouteConfig: () => ({ routeId: 'USDC/example' }),
}));
jest.mock('../warpVisualization/useWarpRouteBalances', () => ({
  useWarpRouteBalances: jest.fn(),
}));
jest.mock('./WarpFeeDetails', () => ({ WarpFeeDetails: () => null }));
jest.mock('./useNativeTokenUsdPrice', () => ({ useTokenUsdPrices: jest.fn() }));

const sourceAddress = `0x${'1'.repeat(40)}`;
const destinationAddress = `0x${'2'.repeat(40)}`;
const token: TokenArgs = {
  chainName: 'ethereum',
  addressOrDenom: sourceAddress,
  decimals: 6,
  symbol: 'USDC',
  name: 'USD Coin',
  coinGeckoId: 'usd-coin',
  standard: TokenStandard.EvmHypCollateral,
};
const route: WarpRouteDetails = {
  amount: '7.5',
  destAmount: '6.25',
  wireAmount: '7500000',
  transferRecipient: `0x${'3'.repeat(40)}`,
  originToken: token,
  destinationToken: { ...token, chainName: 'base', addressOrDenom: destinationAddress },
};
const message: MessageStub = {
  id: 'message',
  msgId: `0x${'4'.repeat(64)}`,
  nonce: 1,
  body: '0x',
  sender: sourceAddress,
  recipient: destinationAddress,
  originDomainId: 1,
  originChainId: 1,
  destinationDomainId: 8453,
  destinationChainId: 8453,
  origin: { hash: '', timestamp: Date.UTC(2020, 0, 1) },
  status: MessageStatus.Delivered,
};

beforeEach(() => {
  mockIsTestnet = false;
  jest.mocked(useTokenUsdPrices).mockReset().mockReturnValue({});
  jest.mocked(useWarpRouteBalances).mockReset().mockReturnValue({
    balances: {},
    isLoading: false,
    isFetching: false,
    refetch: jest.fn(),
  });
});

function render(warpRouteDetails = route, status = MessageStatus.Delivered) {
  const html = renderToStaticMarkup(
    <WarpTransferDetails
      message={{ ...message, status }}
      warpRouteDetails={warpRouteDetails}
      blur={false}
    />,
  );
  return { html, text: html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ') };
}

test('distinguishes an observed zero collateral balance from a missing snapshot', () => {
  jest.mocked(useTokenUsdPrices).mockReturnValue({ 'usd-coin': 1 });
  jest.mocked(useWarpRouteBalances).mockReturnValue({
    balances: { [`ethereum:${sourceAddress}`]: { balance: 0n } },
    isLoading: false,
    isFetching: false,
    refetch: jest.fn(),
  });
  const { html, text } = render();
  expect(html).toContain('title="0 USDC"');
  expect(text.match(/Unavailable/g)).toHaveLength(1);
  expect(text.match(/\$0\.00/g)).toHaveLength(1);
  expect(text).toContain('Latest available balances, not balances at transfer time.');
  expect(text).toContain('+7.5');
  expect(text).toContain('−6.25');
});

test('uses supply signs for burn/mint and marks pending minting as future delivery', () => {
  const { text } = render(
    {
      ...route,
      originToken: { ...route.originToken, standard: TokenStandard.EvmHypSynthetic },
      destinationToken: { ...route.destinationToken, standard: TokenStandard.EvmHypSynthetic },
    },
    MessageStatus.Pending,
  );
  expect(text.match(/Current token supply/g)).toHaveLength(2);
  expect(text).toContain('Burn');
  expect(text).toContain('−7.5');
  expect(text).toContain('Mint on delivery');
  expect(text).toContain('+6.25');
});

test('retains the exact balance in the tooltip when the visible total is compact', () => {
  jest.mocked(useWarpRouteBalances).mockReturnValue({
    balances: { [`ethereum:${sourceAddress}`]: { balance: 123456789012345678901n } },
    isLoading: false,
    isFetching: false,
    refetch: jest.fn(),
  });
  const { html, text } = render({
    ...route,
    originToken: { ...route.originToken, decimals: 18 },
  });
  expect(html).toContain('title="123.456789012345678901 USDC"');
  expect(text).toContain('123.46');
});

test('does not fetch or claim collateral deltas when payload units may be shares', () => {
  jest.mocked(useTokenUsdPrices).mockReturnValue({ 'usd-coin': 1 });
  mockSourceBalance(100_000_000n);
  const { text } = render({
    ...route,
    originToken: { ...route.originToken, standard: TokenStandard.EvmHypRebaseCollateral },
    destinationToken: { ...route.destinationToken, standard: TokenStandard.EvmHypSyntheticRebase },
  });
  expect(jest.mocked(useWarpRouteBalances).mock.calls[0][0]).toEqual([]);
  expect(text.match(/Decoded amount/g)).toHaveLength(2);
  expect(text).not.toMatch(/[+−](7\.5|6\.25)/);
  expect(text).not.toContain('$');
});

function mockSourceBalance(balance: bigint) {
  jest.mocked(useWarpRouteBalances).mockReturnValue({
    balances: { [`ethereum:${sourceAddress}`]: { balance } },
    isLoading: false,
    isFetching: false,
    refetch: jest.fn(),
  });
}

test('values the current balance at the spot price even for an old message', () => {
  jest.mocked(useTokenUsdPrices).mockReturnValue({ 'usd-coin': 2.5 });
  mockSourceBalance(100_000_000n);
  const { text } = render();
  expect(text).toContain('$250.00');
  expect(jest.mocked(useTokenUsdPrices).mock.calls).toHaveLength(2);
  for (const [ids, isTestnet, timestamp] of jest.mocked(useTokenUsdPrices).mock.calls) {
    expect(ids).toEqual(['usd-coin']);
    expect(isTestnet).toBe(false);
    expect(timestamp).toBeUndefined();
  }
});

test('does not borrow the opposite asset price when its own CoinGecko id is missing', () => {
  jest.mocked(useTokenUsdPrices).mockReturnValue({ 'usd-coin': 1 });
  mockSourceBalance(100_000_000n);
  const { text } = render({
    ...route,
    originToken: { ...route.originToken, coinGeckoId: undefined },
  });
  expect(text).not.toContain('$');
  expect(jest.mocked(useTokenUsdPrices).mock.calls.map(([ids]) => ids)).toEqual([[], ['usd-coin']]);
});

test('suppresses testnet USD values even if the price hook returns cached data', () => {
  mockIsTestnet = true;
  jest.mocked(useTokenUsdPrices).mockReturnValue({ 'usd-coin': 1 });
  mockSourceBalance(100_000_000n);
  expect(render().text).not.toContain('$');
  expect(jest.mocked(useTokenUsdPrices).mock.calls.map(([, isTestnet]) => isTestnet)).toEqual([
    true,
    true,
  ]);
});

test.each([undefined, null, NaN, Infinity, -1])(
  'omits an unavailable or invalid price: %s',
  (price) => {
    jest
      .mocked(useTokenUsdPrices)
      .mockReturnValue(price === undefined ? {} : { 'usd-coin': price });
    mockSourceBalance(100_000_000n);
    expect(render().text).not.toContain('$');
  },
);
