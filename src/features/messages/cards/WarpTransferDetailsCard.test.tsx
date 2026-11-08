import type { ChainMetadata } from '@hyperlane-xyz/sdk';
import { hexToRadixCustomPrefix, ProtocolType } from '@hyperlane-xyz/utils';
import { renderToStaticMarkup } from 'react-dom/server';

import { MessageStatus, type MessageStub, type WarpRouteDetails } from '../../../types';
import { useWarpFees } from '../warpFees/useWarpFees';
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

const originAddress = `0x${'11'.repeat(20)}`;
const destinationAddress = `0x${'22'.repeat(20)}`;
const collateralAddress = `0x${'33'.repeat(20)}`;
const recipient = `0x${'44'.repeat(20)}`;
const message = {
  status: MessageStatus.Pending,
  originDomainId: 1,
  destinationDomainId: 2,
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
  expect(html).toContain('Expected destination:');
  expect(html).not.toContain('Received (inferred):');
  expect(html).toContain('Payload amount (raw units)');
  for (const value of [route.wireAmount, route.amount, route.destAmount, recipient]) {
    expect(html).toContain(`data-copy="${value}"`);
  }
  expect(html).toContain(`${route.amount} ORIG`);
  expect(html).toContain(`${route.destAmount} DEST`);
  expect(html).toContain(`href="https://origin.test/address/${originAddress}"`);
  expect(html).toContain(`href="https://destination.test/address/${collateralAddress}"`);
  expect(html).toContain(`title="${collateralAddress}"`);
  expect(html).toContain(`data-copy="${collateralAddress}"`);
  expect(html).toContain(`data-copy="${originAddress}"`);
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
  expect(html).toContain('Received (inferred):');
  expect(html).not.toContain('Expected destination:');
  expect(html).toContain('Collateral-backed route:');
  expect(html).toContain('10.1');
  expect(html).toContain('ORIG');
  expect(html.replace(/<!-- -->/g, '')).toContain('0.1 ORIG (100 bps)');
  expect(html).toContain('blur-xs');
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

it('keeps native Cosmos denominations copyable without inventing address explorer links', () => {
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
  expect(html).toContain('data-copy="uatom"');
  expect(html).not.toContain('href="https://destination.test/address/uatom"');
});
