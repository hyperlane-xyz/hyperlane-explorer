import { renderToStaticMarkup } from 'react-dom/server';

import { Message, MessageStatus, type MessageStub } from '../../../types';
import { IgpPayment, IgpPaymentDenomKind, IgpPaymentsStatus } from '../igpPayments';
import { GasDetailsCard } from './GasDetailsCard';
import { useIgpPayments } from './useIgpPayments';

jest.mock('@hyperlane-xyz/widgets', () => ({
  BoxArrowIcon: () => null,
  CopyButton: () => null,
  Tooltip: () => null,
}));
jest.mock('../../../metadataStore', () => ({
  useChainMetadataResolver: () => ({
    tryGetChainMetadata: () => ({
      nativeToken: { symbol: 'ETH', decimals: 18 },
      gasCurrencyCoinGeckoId: 'ethereum',
    }),
  }),
}));
jest.mock('./useIgpPayments', () => ({ useIgpPayments: jest.fn() }));
jest.mock('./useNativeTokenUsdPrice', () => ({
  useNativeTokenUsdPrice: () => 2000,
  useTokenUsdPrices: () => ({ 'usd-coin': 1 }),
}));

const IGP = '0xc3F23848Ed2e04C0c6d41bd7804fa8f89F940B94';
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

// A scraped message that has no payment aggregates yet
const stub: MessageStub = {
  status: MessageStatus.Delivered,
  id: '1',
  msgId: '0xcdcf983bb5fd448c0cd42ca0d7c90c2db289ccdff5636571195a03db906eb379',
  nonce: 2184817,
  sender: '0x5ff3c3aaD59b590e7989092bA37F02F263DB8791',
  recipient: '0x11A483d69Cc67a4a9d1B3a2c1C6C5837aeC11246',
  originChainId: 8453,
  originDomainId: 8453,
  destinationChainId: 56,
  destinationDomainId: 56,
  origin: {
    timestamp: 1_700_000_000_000,
    hash: '0xd9cfe29dcf3af7ab5fd41d28e42e6a023692a081e739bfa8507c9b1c2fd72e33',
    from: '0x3f13c1351ac66ca0f4827c607a94c93c82ad0913',
    to: '0x5ff3c3aaD59b590e7989092bA37F02F263DB8791',
  },
  body: '0x',
};

interface Aggregates {
  totalGasAmount: string;
  totalPayment: string;
  numPayments: number;
}

function makeMessage(aggregates: Aggregates): Message {
  return {
    status: stub.status,
    id: stub.id,
    msgId: stub.msgId,
    nonce: stub.nonce,
    sender: stub.sender,
    recipient: stub.recipient,
    originChainId: stub.originChainId,
    originDomainId: stub.originDomainId,
    destinationChainId: stub.destinationChainId,
    destinationDomainId: stub.destinationDomainId,
    origin: {
      timestamp: stub.origin.timestamp,
      hash: stub.origin.hash,
      from: stub.origin.from,
      to: stub.origin.to,
      blockHash: '0x',
      blockNumber: 52260877,
      mailbox: '0xeA87ae93Fa0019a82A727bfd3eBd1cFCa8f64f1D',
      nonce: 0,
      gasLimit: 0,
      gasPrice: 0,
      effectiveGasPrice: 0,
      gasUsed: 0,
      cumulativeGasUsed: 0,
      maxFeePerGas: 0,
      maxPriorityPerGas: 0,
    },
    body: stub.body,
    totalGasAmount: aggregates.totalGasAmount,
    totalPayment: aggregates.totalPayment,
    numPayments: aggregates.numPayments,
  };
}

const nativePayment: IgpPayment = {
  gasAmount: '230887',
  paymentAmount: '300000000000000',
  denom: { kind: IgpPaymentDenomKind.Native },
};
const tokenPayment: IgpPayment = {
  gasAmount: '230887',
  paymentAmount: '212909',
  denom: { kind: IgpPaymentDenomKind.Token, address: USDC },
};
const USDC_METADATA = {
  [USDC.toLowerCase()]: { symbol: 'USDC', decimals: 6, coinGeckoId: 'usd-coin' },
};
const debuggerPayments = {
  [IGP]: [{ gasAmount: '230887', paymentAmount: '300000000000000' }],
};

function renderCard(message: Message | MessageStub, igpPayments?: typeof debuggerPayments) {
  return renderToStaticMarkup(
    <GasDetailsCard message={message} blur={false} igpPayments={igpPayments} />,
  );
}

function textOf(html: string) {
  return html.replace(/<[^>]+>/g, '');
}

// The `w-*` class of every row label, by label text
function labelWidths(html: string): Record<string, string | undefined> {
  return Object.fromEntries(
    [...html.matchAll(/<label class="([^"]*)">([^<]*)<\/label>/g)].map(([, classes, text]) => [
      text,
      classes.match(/\bw-\d+\b/)?.[0],
    ]),
  );
}

const mockUseIgpPayments = jest.mocked(useIgpPayments);

describe('with a token-denominated receipt', () => {
  beforeEach(() => {
    mockUseIgpPayments.mockReturnValue({
      status: IgpPaymentsStatus.Ready,
      payments: [tokenPayment],
      tokenMetadata: USDC_METADATA,
    });
  });

  it('shows token payments in token units without a payments table', () => {
    const complete = makeMessage({
      totalGasAmount: '230887',
      totalPayment: '212909',
      numPayments: 1,
    });

    // Rows from the debugger would otherwise render the (native-denominated) table
    const html = renderCard(complete, debuggerPayments);

    expect(textOf(html)).toContain('Paid at dispatch:0.212909 USDC($0.21)');
    expect(textOf(html)).not.toContain('ETH');
    expect(textOf(html)).not.toContain('Other payments');
    expect(html).not.toContain('<table');
  });

  it('itemizes payments the origin receipt does not explain', () => {
    const toppedUp = makeMessage({
      totalGasAmount: '461774',
      totalPayment: '425818',
      numPayments: 2,
    });

    const text = textOf(renderCard(toppedUp));

    expect(text).toContain('Payment count:2');
    expect(text).toContain('Total gas amount:461774');
    expect(text).toContain('Paid at dispatch:0.212909 USDC($0.21)');
    expect(text).toContain('Other payments:1 payment, 212909 raw units (unit unknown)');
  });

  it('takes payment count and gas from the receipt when the message has no aggregates', () => {
    const text = textOf(renderCard(stub));

    expect(text).toContain('Payment count:1');
    expect(text).toContain('Total gas amount:230887');
    expect(text).toContain('Paid at dispatch:0.212909 USDC($0.21)');
    expect(text).not.toContain('Other payments');
  });

  it('aligns the values of the dispatch payment and the other payments', () => {
    const toppedUp = makeMessage({
      totalGasAmount: '461774',
      totalPayment: '425818',
      numPayments: 2,
    });

    const widths = labelWidths(renderCard(toppedUp));

    expect(widths['Paid at dispatch:']).toBe('w-36');
    expect(widths['Other payments:']).toBe('w-36');
  });

  it('aligns the values of several dispatch payments and the other payments', () => {
    mockUseIgpPayments.mockReturnValue({
      status: IgpPaymentsStatus.Ready,
      payments: [tokenPayment, nativePayment],
      tokenMetadata: USDC_METADATA,
    });
    const toppedUp = makeMessage({
      totalGasAmount: '692661',
      totalPayment: '600000000212909',
      numPayments: 3,
    });

    const widths = labelWidths(renderCard(toppedUp));

    expect(widths['Paid at dispatch (USDC):']).toBe('w-52');
    expect(widths['Paid at dispatch (ETH):']).toBe('w-52');
    expect(widths['Other payments:']).toBe('w-52');
  });
});

describe('with a native-denominated receipt', () => {
  beforeEach(() => {
    mockUseIgpPayments.mockReturnValue({
      status: IgpPaymentsStatus.Ready,
      payments: [nativePayment],
      tokenMetadata: {},
    });
  });

  it('keeps the native display and payments table', () => {
    const html = renderCard(stub, debuggerPayments);

    expect(textOf(html)).toContain('Paid at dispatch:0.0003 ETH($0.60)');
    expect(textOf(html.match(/<thead>.*<\/thead>/)?.[0] ?? '')).toBe(
      'IGP AddressGas amountPayment (ETH)Payment (USD)',
    );
  });

  it('takes payment count, gas and total from the receipt without message aggregates', () => {
    const text = textOf(renderCard(stub));

    expect(text).toContain('Payment count:1');
    expect(text).toContain('Total gas amount:230887');
    expect(text).toContain('Paid at dispatch:0.0003 ETH($0.60)');
  });

  it('shows later payments in unknown units even when the dispatch payment is native', () => {
    const toppedUp = makeMessage({
      totalGasAmount: '461774',
      totalPayment: '600000000000000',
      numPayments: 2,
    });

    const text = textOf(renderCard(toppedUp));

    expect(text).toContain('Payment count:2');
    expect(text).toContain('Total gas amount:461774');
    expect(text).toContain('Paid at dispatch:0.0003 ETH($0.60)');
    expect(text).toContain('Other payments:1 payment, 300000000000000 raw units (unit unknown)');
    expect(text).not.toContain('0.0006 ETH');
    expect(text).not.toContain('$1.20');
  });

  it('does not label a later ERC20 payment as native in totals or the debugger table', () => {
    const toppedUp = makeMessage({
      totalGasAmount: '461774',
      totalPayment: '300000000212909',
      numPayments: 2,
    });
    const html = renderCard(toppedUp, { [IGP]: [nativePayment, tokenPayment] });
    const text = textOf(html);

    expect(text).toContain('Paid at dispatch:0.0003 ETH($0.60)');
    expect(text).toContain('Other payments:1 payment, 212909 raw units (unit unknown)');
    expect(text).not.toContain('0.000300000000212909 ETH');
    expect(html).not.toContain('<table');
  });
});

describe('with no payments in the dispatch receipt', () => {
  beforeEach(() => {
    mockUseIgpPayments.mockReturnValue({
      status: IgpPaymentsStatus.Ready,
      payments: [],
      tokenMetadata: {},
    });
  });

  it('does not infer native units for a payment made after dispatch', () => {
    const paidLater = makeMessage({
      totalGasAmount: '230887',
      totalPayment: '212909',
      numPayments: 1,
    });
    const html = renderCard(paidLater, { [IGP]: [tokenPayment] });
    const text = textOf(html);

    expect(text).toContain('Paid at dispatch:None');
    expect(text).toContain('Other payments:1 payment, 212909 raw units (unit unknown)');
    expect(text).not.toContain('ETH');
    expect(text).not.toContain('$');
    expect(html).not.toContain('<table');
  });

  it('shows no dispatch payment when no later payments are known', () => {
    const text = textOf(renderCard(stub));

    expect(text).toContain('Payment count:0');
    expect(text).toContain('Paid at dispatch:None');
    expect(text).not.toContain('Other payments');
    expect(text).not.toContain('ETH');
    expect(text).not.toContain('$');
  });
});

describe('while the denomination is not known', () => {
  const aggregates = makeMessage({
    totalGasAmount: '230887',
    totalPayment: '212909',
    numPayments: 1,
  });

  it('shows a placeholder instead of a native amount while the receipt is loading', () => {
    mockUseIgpPayments.mockReturnValue({
      status: IgpPaymentsStatus.Pending,
      payments: undefined,
      tokenMetadata: {},
    });

    const text = textOf(renderCard(aggregates, debuggerPayments));

    expect(text).toContain('Total paid:Loading...');
    expect(text).toContain('Payment count:1');
    expect(text).toContain('Total gas amount:230887');
    expect(text).not.toContain('ETH');
    expect(text).not.toContain('$');
  });

  it('shows the amount in raw units when the receipt could not be read', () => {
    mockUseIgpPayments.mockReturnValue({
      status: IgpPaymentsStatus.Error,
      payments: undefined,
      tokenMetadata: {},
    });

    // Rows from the debugger would otherwise render the (native-denominated) table
    const html = renderCard(aggregates, {
      [IGP]: [{ gasAmount: '230887', paymentAmount: '212909' }],
    });
    const text = textOf(html);

    expect(text).toContain('Total paid:212909 raw units(unit unverified)');
    expect(text).not.toContain('ETH');
    expect(text).not.toContain('$');
    expect(html).not.toContain('<table');
  });
});

describe('when the receipt is not read', () => {
  beforeEach(() => {
    mockUseIgpPayments.mockReturnValue({
      status: IgpPaymentsStatus.Disabled,
      payments: undefined,
      tokenMetadata: {},
    });
  });

  it('keeps the native display and payments table', () => {
    const html = renderCard(stub, debuggerPayments);

    expect(textOf(html)).toContain('Total paid:0.0003 ETH($0.60)');
    expect(html).toContain('<table');
  });

  it('renders no payments table without debugger payments', () => {
    expect(renderCard(stub)).not.toContain('<table');
  });

  it('keeps the label width of the native display', () => {
    expect(labelWidths(renderCard(stub, debuggerPayments))['Total paid:']).toBe('w-24');
  });
});
