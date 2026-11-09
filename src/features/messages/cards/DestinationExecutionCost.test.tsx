import { ProtocolType } from '@hyperlane-xyz/utils';
import { renderToStaticMarkup } from 'react-dom/server';

import { MessageStatus, type Message } from '../../../types';
import { DestinationExecutionCost } from './DestinationExecutionCost';

let mockDecimals: number | undefined = 6;
let mockProtocol = ProtocolType.Ethereum;
let mockName = 'tempo';
jest.mock('../../../metadataStore', () => ({
  useChainMetadataResolver: () => ({
    tryGetChainMetadata: () => ({
      name: mockName,
      protocol: mockProtocol,
      nativeToken: { decimals: mockDecimals, symbol: 'pathUSD' },
    }),
  }),
}));
jest.mock('./useNativeTokenUsdPrice', () => ({ useNativeTokenUsdPrice: () => 1 }));

const message = {
  status: MessageStatus.Delivered,
  destinationDomainId: 4217,
  destination: {
    timestamp: 1_700_000_000_000,
    hash: '0x',
    gasUsed: 1629985,
    effectiveGasPrice: 1600000000,
  },
} as Message;
const render = (value = message) =>
  renderToStaticMarkup(<DestinationExecutionCost message={value} blur={false} />).replace(
    /<[^>]+>/g,
    '',
  );
beforeEach(() => {
  mockDecimals = 6;
  mockProtocol = ProtocolType.Ethereum;
  mockName = 'tempo';
});

it('preserves the Tempo attodollar conversion without claiming who paid the transaction cost', () => {
  const text = render();
  expect(text).toContain('Gas cost:0.002608 pathUSD($0.002608)');
  expect(text).not.toContain('2607976000 pathUSD');
  expect(text).toContain('may deliver multiple messages');
  expect(text).not.toContain('relayer paid');
});

it.each([ProtocolType.Sealevel, ProtocolType.Cosmos, ProtocolType.CosmosNative])(
  'preserves scraper-scaled non-EVM cost for %s',
  (protocol) => {
    mockProtocol = protocol;
    mockName = 'destination';
    mockDecimals = 9;
    expect(
      render({
        ...message,
        isPiMsg: true,
        destination: { ...message.destination!, gasUsed: 1, effectiveGasPrice: 1e15 },
      }),
    ).toContain('Gas cost:0.001 pathUSD');
  },
);

it('keeps real zero cost distinct from missing metadata or gas-price data', () => {
  expect(
    render({ ...message, destination: { ...message.destination!, effectiveGasPrice: 0 } }),
  ).toContain('Gas cost:0 pathUSD');
  expect(
    render({ ...message, destination: { ...message.destination!, effectiveGasPrice: undefined } }),
  ).not.toContain('Gas cost:');
  mockDecimals = undefined;
  expect(render()).toContain('Gas used:1629985');
  expect(render()).not.toContain('Gas cost:');
});

it('hides stale execution data for a pending message and missing transaction data', () => {
  expect(render({ ...message, status: MessageStatus.Pending })).toBe('');
  expect(render({ ...message, destination: undefined })).toBe('');
});
