import type { ChainMetadata } from '@hyperlane-xyz/sdk';
import { hexToRadixCustomPrefix, ProtocolType } from '@hyperlane-xyz/utils';
import { renderToStaticMarkup } from 'react-dom/server';

import { MessageStatus, type MessageStub, type WarpRouteDetails } from '../../../types';
import { useWarpFees } from '../warpFees/useWarpFees';
import { useTokenUsdPrices } from './useNativeTokenUsdPrice';
import { WarpTransferDetails, WarpTransferDetailsCard } from './WarpTransferDetailsCard';

jest.mock('@hyperlane-xyz/widgets', () => ({
  BoxArrowIcon: () => null,
  Tooltip: () => null,
  CopyButton: ({ copyValue, ...props }: { copyValue: string }) => (
    <button {...props} data-copy={copyValue}>
      Copy
    </button>
  ),
}));
jest.mock('../../../components/icons/TokenIcon', () => ({
  TokenIcon: ({ token }: { token: { symbol: string; logoURI: string } }) => (
    <img alt={token.symbol} src={token.logoURI} />
  ),
}));
jest.mock('../../../metadataStore', () => ({
  useChainMetadataResolver: () => ({
    tryGetChainMetadata: (id: number) => mockMetadata.find((chain) => chain.domainId === id),
  }),
}));
jest.mock('../collateral/utils', () => ({
  isCollateralRoute: (standard: string) => standard.includes('Collateral'),
}));
jest.mock('../warpFees/useWarpFees');
jest.mock('./useNativeTokenUsdPrice', () => ({ useTokenUsdPrices: jest.fn() }));

const originAddress = `0x${'11'.repeat(20)}`;
const destinationAddress = `0x${'22'.repeat(20)}`;
const collateralAddress = `0x${'33'.repeat(20)}`;
const recipient = `0x${'44'.repeat(20)}`;
const message = {
  status: MessageStatus.Pending,
  originDomainId: 1,
  destinationDomainId: 2,
  origin: { timestamp: 1_700_000_000_000, hash: 'origin' },
} as MessageStub;
const route: WarpRouteDetails = {
  wireAmount: '123456789012345678901234567891',
  amount: '12345678901.234567890123456789',
  destAmount: '123456789012.345678901234567891',
  transferRecipient: recipient,
  originToken: {
    chainName: 'origin',
    standard: 'EvmHypSynthetic',
    addressOrDenom: originAddress,
    symbol: 'ORIG',
    name: 'Origin',
    decimals: 18,
    logoURI: 'https://example.test/origin.svg',
  },
  destinationToken: {
    chainName: 'destination',
    standard: 'EvmHypCollateral',
    addressOrDenom: destinationAddress,
    collateralAddressOrDenom: collateralAddress,
    symbol: 'DEST',
    name: 'Destination',
    decimals: 18,
    logoURI: 'https://example.test/destination.svg',
  },
};
let mockMetadata: ChainMetadata[];
beforeEach(() => {
  mockMetadata = ['origin', 'destination'].map((name, index) => ({
    name,
    chainId: index + 1,
    domainId: index + 1,
    protocol: ProtocolType.Ethereum,
    rpcUrls: [{ http: 'https://rpc.invalid' }],
    blockExplorers: [{ name, url: `https://${name}.test`, family: 'etherscan' }],
  }));
  jest.mocked(useWarpFees).mockReset();
  jest.mocked(useWarpFees).mockReturnValue(null);
  jest.mocked(useTokenUsdPrices).mockReset().mockReturnValue({});
});

it('embeds exact copyable payload data with token links and registry-qualified expected amounts', () => {
  const html = renderToStaticMarkup(
    <WarpTransferDetails message={message} warpRouteDetails={route} blur={false} />,
  );
  expect(html).not.toContain('<section');
  expect(useWarpFees).toHaveBeenCalledWith(message, route);
  expect(html).not.toContain('Warp fee (inferred)');
  expect(html).not.toContain('Separate Warp fee unavailable');
  expect(html).toContain('Hyperlane Registry token metadata');
  expect(html).toContain('Expected:');
  expect(html).not.toContain('Received:');
  expect(html).toContain('Payload amount (raw units)');
  expect(html).toContain('Sent:');
  for (const value of [route.amount, route.destAmount])
    expect(html).not.toContain(`data-copy="${value}"`);
  for (const value of [route.wireAmount, recipient]) {
    expect(html).toContain(`data-copy="${value}"`);
  }
  expect(html).toContain(`${route.amount} ORIG`);
  expect(html).toContain(`${route.destAmount} DEST`);
  expect(html).toContain(`href="https://origin.test/address/${originAddress}"`);
  expect(html).toContain(`href="https://destination.test/address/${collateralAddress}"`);
  expect(html).toContain(`title="${collateralAddress}"`);
  expect(html).not.toContain(`data-copy="${collateralAddress}"`);
  expect(html).not.toContain(`data-copy="${originAddress}"`);
  expect(html).not.toContain(`href="https://destination.test/address/${destinationAddress}"`);
  expect(html).toContain(`href="https://destination.test/address/${recipient}"`);
  expect(html).toContain('alt="ORIG"');
  expect(html).toContain('alt="DEST"');
});

it('retains collateral and fee information with delivered amounts explicitly inferred', () => {
  jest.mocked(useWarpFees).mockReturnValue({
    totalSent: '10.1',
    bridgeFee: '0.1',
    bridgeFeeBps: '100',
    tokenSymbol: 'ORIG',
  });
  const html = renderToStaticMarkup(
    <WarpTransferDetailsCard
      message={{ ...message, status: MessageStatus.Delivered }}
      warpRouteDetails={route}
      blur
    />,
  );
  expect(html.match(/<section\b/g)).toHaveLength(1);
  expect(html).toContain('Received:');
  expect(html).not.toContain('Expected:');
  expect(html).toContain('Collateral-backed route:');
  expect(html).toContain('10.1');
  expect(html).toContain('ORIG');
  expect(html.replace(/<!-- -->/g, '')).toContain('0.1 ORIG (100 bps)');
  expect(html).toContain('blur-xs');
  expect(html).toContain('Amount inferred from the payload and Hyperlane Registry token metadata.');
});

it('keeps a native Radix recipient unchanged when copying and linking', () => {
  const account = hexToRadixCustomPrefix(`0x0000${'01'.repeat(30)}`, 'account', 'account_rdx', 30);
  mockMetadata[1] = {
    ...mockMetadata[1],
    protocol: ProtocolType.Radix,
    blockExplorers: [{ name: 'Radix', url: 'https://radix.test', family: 'radixdashboard' }],
  };
  const html = renderToStaticMarkup(
    <WarpTransferDetails
      message={message}
      warpRouteDetails={{ ...route, transferRecipient: account }}
      blur={false}
    />,
  );
  expect(html).toContain(`data-copy="${account}"`);
  expect(html).toContain(`href="https://radix.test/account/${account}"`);
});

it('identifies native Cosmos denominations without inventing address explorer links', () => {
  mockMetadata[1] = { ...mockMetadata[1], protocol: ProtocolType.Cosmos };
  const html = renderToStaticMarkup(
    <WarpTransferDetails
      message={message}
      warpRouteDetails={{
        ...route,
        destinationToken: { ...route.destinationToken, collateralAddressOrDenom: 'uatom' },
      }}
      blur={false}
    />,
  );
  expect(html).toContain('title="uatom"');
  expect(html).not.toContain('href="https://destination.test/address/uatom"');
});

it('values each token at its recorded transaction date and uses current price for pending receipt', () => {
  const pricedRoute = {
    ...route,
    amount: '2.5',
    destAmount: '3',
    originToken: { ...route.originToken, coinGeckoId: 'origin-asset' },
    destinationToken: { ...route.destinationToken, coinGeckoId: 'destination-asset' },
  };
  jest.mocked(useTokenUsdPrices).mockReturnValue({ 'origin-asset': 2, 'destination-asset': 4 });
  const destination = { timestamp: 1_700_086_400_000, hash: 'delivery' };
  const html = renderToStaticMarkup(
    <WarpTransferDetails
      message={{ ...message, status: MessageStatus.Delivered, destination }}
      warpRouteDetails={pricedRoute}
      blur={false}
    />,
  );
  expect(html.replace(/<!-- -->/g, '')).toContain('($5.00)');
  expect(html.replace(/<!-- -->/g, '')).toContain('($12.00)');
  expect(useTokenUsdPrices).toHaveBeenCalledWith(['origin-asset'], false, message.origin.timestamp);
  expect(useTokenUsdPrices).toHaveBeenCalledWith(
    ['destination-asset'],
    false,
    destination.timestamp,
  );
  jest.mocked(useTokenUsdPrices).mockClear();
  renderToStaticMarkup(
    <WarpTransferDetails message={message} warpRouteDetails={pricedRoute} blur={false} />,
  );
  expect(useTokenUsdPrices).toHaveBeenCalledWith(['destination-asset'], false, undefined);
});

it('omits unavailable USD values and keeps testnet prices isolated', () => {
  mockMetadata[1] = { ...mockMetadata[1], isTestnet: true };
  jest.mocked(useTokenUsdPrices).mockReturnValue({ 'destination-asset': null });
  const html = renderToStaticMarkup(
    <WarpTransferDetails
      message={message}
      warpRouteDetails={{
        ...route,
        destinationToken: { ...route.destinationToken, coinGeckoId: 'destination-asset' },
      }}
      blur={false}
    />,
  );
  expect(html).not.toContain('($');
  expect(useTokenUsdPrices).toHaveBeenCalledWith([], false, message.origin.timestamp);
  expect(useTokenUsdPrices).toHaveBeenCalledWith(['destination-asset'], true, undefined);
});
