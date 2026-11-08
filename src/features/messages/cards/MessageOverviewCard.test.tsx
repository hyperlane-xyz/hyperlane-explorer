import type { ChainMetadata } from '@hyperlane-xyz/sdk';
import { hexToRadixCustomPrefix, ProtocolType } from '@hyperlane-xyz/utils';
import { renderToStaticMarkup } from 'react-dom/server';

import { MessageStatus, type MessageStub, type WarpRouteDetails } from '../../../types';
import { MessageOverviewCard } from './MessageOverviewCard';

jest.mock('@hyperlane-xyz/widgets', () => ({
  BoxArrowIcon: () => null,
  EnvelopeIcon: () => null,
  WideChevronIcon: () => <svg data-chevron="true" />,
  SpinnerIcon: () => <svg data-spinner="true" />,
  CopyButton: ({ copyValue }: { copyValue: string }) => <button data-copy={copyValue}>Copy</button>,
}));
jest.mock('../../../components/icons/ChainLogo', () => ({ ChainLogo: () => null }));
jest.mock('../../../components/icons/TokenIcon', () => ({ TokenIcon: () => null }));
jest.mock('../../../metadataStore', () => ({
  useChainMetadataResolver: () => ({
    tryGetChainName: (id: number) => mockMetadata.find((chain) => chain.domainId === id)?.name,
    tryGetChainMetadata: (id: number | string) =>
      mockMetadata.find((chain) => chain.domainId === id || chain.name === id),
  }),
}));

const sender = `0x${'11'.repeat(20)}`;
const recipient = `0x${'22'.repeat(20)}`;
const initiator = `0x${'33'.repeat(20)}`;
const transferRecipient = `0x${'44'.repeat(20)}`;
const originHash = `0x${'55'.repeat(32)}`;
const destinationHash = `0x${'66'.repeat(32)}`;
const message: MessageStub = {
  id: '1',
  msgId: `0x${'77'.repeat(32)}`,
  nonce: 0,
  status: MessageStatus.Pending,
  originChainId: 1,
  originDomainId: 1,
  destinationChainId: 2,
  destinationDomainId: 2,
  sender,
  recipient,
  body: '0x1234',
  origin: { hash: originHash, timestamp: 1000, from: initiator },
};
const route: WarpRouteDetails = {
  wireAmount: '2000000000000000000',
  amount: '2',
  destAmount: '20',
  transferRecipient,
  originToken: {
    chainName: 'source',
    addressOrDenom: sender,
    standard: 'EvmHypSynthetic',
    name: 'Source token',
    symbol: 'SRC',
    decimals: 18,
  },
  destinationToken: {
    chainName: 'destination',
    addressOrDenom: recipient,
    standard: 'EvmHypSynthetic',
    name: 'Destination token',
    symbol: 'DST',
    decimals: 18,
  },
};
let mockMetadata: ChainMetadata[];

beforeEach(() => {
  mockMetadata = ['source', 'destination'].map((name, index) => ({
    name,
    chainId: index + 1,
    domainId: index + 1,
    protocol: ProtocolType.Ethereum,
    rpcUrls: [{ http: 'https://rpc.invalid' }],
    blockExplorers: [{ name, url: `https://${name}.test`, family: 'etherscan' }],
  }));
});

it('distinguishes projected bridge amounts and recipients from application addresses', () => {
  const pending = renderToStaticMarkup(
    <MessageOverviewCard message={message} warpRouteDetails={route} txMessageCount={3} />,
  );
  expect(pending).toContain('Expected amount');
  expect(pending).toContain('title="2 SRC"');
  expect(pending).toContain('title="20 DST"');
  expect(pending).toContain('Initiated by');
  expect(pending).toContain(`data-copy="${initiator}"`);
  expect(pending).toContain('Transfer recipient');
  expect(pending).toContain(`data-copy="${transferRecipient}"`);
  expect(pending).not.toContain(`data-copy="${sender}"`);
  expect(pending).not.toContain('data-payload');
  expect(pending).toContain(`href="/tx/${originHash}"`);

  const delivered = renderToStaticMarkup(
    <MessageOverviewCard
      message={{ ...message, status: MessageStatus.Delivered }}
      warpRouteDetails={{ ...route, destAmount: null }}
    />,
  );
  expect(delivered).toContain('Bridged amount');
  expect(delivered).toContain('title="2 DST"');
  expect(delivered).not.toContain('Expected amount');
  expect(delivered).toContain('Delivery recorded · transaction indexing');
});

it('shows generic application endpoints without inventing transfer amounts', () => {
  const html = renderToStaticMarkup(<MessageOverviewCard message={message} />);
  expect(html).toContain('Sending application');
  expect(html).toContain('Receiving application');
  expect(html).toContain(`data-copy="${sender}"`);
  expect(html).toContain(`data-copy="${recipient}"`);
  expect(html).not.toContain('Expected amount');
});

it('links native delivery hashes only for delivered messages and rejects zero hashes', () => {
  mockMetadata[1] = { ...mockMetadata[1], protocol: ProtocolType.Cosmos };
  const value = { ...message, destination: { hash: destinationHash, timestamp: 2000 } };
  const pending = renderToStaticMarkup(<MessageOverviewCard message={value} />);
  expect(pending).not.toContain(`https://destination.test/tx/`);
  const delivered = renderToStaticMarkup(
    <MessageOverviewCard message={{ ...value, status: MessageStatus.Delivered }} />,
  );
  expect(delivered).toContain(`href="https://destination.test/tx/${destinationHash.slice(2)}"`);
  expect(delivered).toContain(`data-copy="${destinationHash.slice(2)}"`);
  const missing = renderToStaticMarkup(
    <MessageOverviewCard
      message={{
        ...value,
        status: MessageStatus.Delivered,
        destination: { hash: `0x${'00'.repeat(32)}`, timestamp: 0 },
      }}
    />,
  );
  expect(missing).toContain('Delivery recorded · transaction indexing');
  expect(missing).not.toContain('https://destination.test/tx/');
});

it('preserves native Radix account recipients and full transfer precision', () => {
  mockMetadata = mockMetadata.map((metadata) => ({
    ...metadata,
    protocol: ProtocolType.Radix,
    bech32Prefix: 'account_rdx',
    blockExplorers: [
      { name: metadata.name, url: `https://${metadata.name}.test`, family: 'radixdashboard' },
    ],
  }));
  const account = hexToRadixCustomPrefix(`0x0000${'01'.repeat(30)}`, 'account', 'account_rdx', 30);
  const html = renderToStaticMarkup(
    <MessageOverviewCard
      message={{ ...message, origin: { ...message.origin, from: account } }}
      warpRouteDetails={{ ...route, amount: '4996.61864', transferRecipient: account }}
    />,
  );
  expect(html).toContain(`href="https://source.test/account/${account}"`);
  expect(html).toContain(`href="https://destination.test/account/${account}"`);
  expect(html).toContain(`data-copy="${account}"`);
  expect(html).not.toContain('/component/');
  expect(html).toContain('>4,996.61864 ');
});

it('animates only active pending delivery and preserves success while confirming', () => {
  const active = renderToStaticMarkup(<MessageOverviewCard message={message} active />);
  expect(active).toContain('data-spinner="true"');
  expect(active.match(/data-chevron="true"/g)).toHaveLength(2);
  const paused = renderToStaticMarkup(<MessageOverviewCard message={message} />);
  expect(paused).not.toContain('data-spinner="true"');
  const delivered = renderToStaticMarkup(
    <MessageOverviewCard message={{ ...message, status: MessageStatus.Delivered }} active />,
  );
  expect(delivered).not.toContain('data-spinner="true"');
  expect(delivered).toContain('Successful delivery');
  const failed = renderToStaticMarkup(
    <MessageOverviewCard message={{ ...message, status: MessageStatus.Failing }} active />,
  );
  expect(failed).not.toContain('data-spinner="true"');
});
