import BigNumber from 'bignumber.js';

import { IgpPayment, IgpPaymentDenom, IgpPaymentDenomKind } from '../igpPayments';
import {
  formatOtherPayments,
  formatPaymentAmount,
  formatPaymentUsd,
  formatRawUnits,
  formatUsd,
  getOtherPayments,
  hasNonNativePayments,
  NATIVE_ASSET_ID,
  OtherPayments,
  PaymentAsset,
  resolvePaymentAsset,
  summarizePayments,
  sumPayments,
  TokenMetadata,
} from './gasPaymentSummary';

const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const USDT = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
const SHORT_USDT = '0xdAC...1ec7';

const NATIVE_DENOM: IgpPaymentDenom = { kind: IgpPaymentDenomKind.Native };
const AMBIGUOUS_DENOM: IgpPaymentDenom = { kind: IgpPaymentDenomKind.Ambiguous };
const token = (address: string): IgpPaymentDenom => ({ kind: IgpPaymentDenomKind.Token, address });

const ETH: PaymentAsset = {
  id: NATIVE_ASSET_ID,
  symbol: 'ETH',
  decimals: 18,
  coinGeckoId: 'ethereum',
};
const TOKEN_METADATA: Record<string, TokenMetadata> = {
  [USDC.toLowerCase()]: { symbol: 'USDC', decimals: 6, coinGeckoId: 'usd-coin' },
};

function payment(paymentAmount: string, denom: IgpPaymentDenom): IgpPayment {
  return { gasAmount: '230887', paymentAmount, denom };
}

describe('resolvePaymentAsset', () => {
  interface Case {
    name: string;
    denom: IgpPaymentDenom;
    expected: PaymentAsset;
  }
  const cases: Case[] = [
    { name: 'native', denom: NATIVE_DENOM, expected: ETH },
    {
      name: 'token with metadata',
      denom: token(USDC),
      expected: { id: USDC.toLowerCase(), symbol: 'USDC', decimals: 6, coinGeckoId: 'usd-coin' },
    },
    {
      name: 'token without metadata',
      denom: token(USDT),
      expected: { id: USDT.toLowerCase(), symbol: SHORT_USDT },
    },
    {
      name: 'ambiguous token',
      denom: AMBIGUOUS_DENOM,
      expected: { id: 'ambiguous', symbol: 'unknown token' },
    },
  ];
  for (const c of cases) {
    it(`resolves ${c.name}`, () => {
      expect(resolvePaymentAsset(c.denom, ETH, TOKEN_METADATA)).toEqual(c.expected);
    });
  }
});

describe('formatPaymentAmount', () => {
  interface Case {
    name: string;
    amountRaw: string;
    asset: PaymentAsset;
    expected: string;
  }
  const cases: Case[] = [
    {
      name: 'token with its own decimals',
      amountRaw: '212909',
      asset: { id: 'usdc', symbol: 'USDC', decimals: 6 },
      expected: '0.212909 USDC',
    },
    {
      name: 'native with native decimals',
      amountRaw: '300000000000000',
      asset: ETH,
      expected: '0.0003 ETH',
    },
    {
      name: 'unresolved token in raw units',
      amountRaw: '212909',
      asset: { id: USDT.toLowerCase(), symbol: SHORT_USDT },
      expected: `212909 raw units (${SHORT_USDT})`,
    },
    {
      name: 'ambiguous token in raw units',
      amountRaw: '212909',
      asset: { id: 'ambiguous', symbol: 'unknown token' },
      expected: '212909 raw units (unknown token)',
    },
  ];
  for (const c of cases) {
    it(`formats ${c.name}`, () => {
      expect(formatPaymentAmount(c.amountRaw, c.asset)).toBe(c.expected);
    });
  }
});

describe('formatPaymentUsd', () => {
  interface Case {
    name: string;
    amountRaw: string;
    asset: PaymentAsset;
    usdPrice: number | null;
    expected: string | null;
  }
  const usdc: PaymentAsset = { id: 'usdc', symbol: 'USDC', decimals: 6, coinGeckoId: 'usd-coin' };
  const cases: Case[] = [
    { name: 'priced token', amountRaw: '1500000', asset: usdc, usdPrice: 1, expected: '$1.50' },
    {
      name: 'sub-cent value',
      amountRaw: '2129',
      asset: usdc,
      usdPrice: 1,
      expected: '$0.002129',
    },
    {
      name: 'no price (no coingecko id)',
      amountRaw: '1500000',
      asset: usdc,
      usdPrice: null,
      expected: null,
    },
    {
      name: 'unresolved decimals',
      amountRaw: '1500000',
      asset: { id: 'x', symbol: 'X', coinGeckoId: 'x' },
      usdPrice: 1,
      expected: null,
    },
  ];
  for (const c of cases) {
    it(`formats ${c.name}`, () => {
      expect(formatPaymentUsd(c.amountRaw, c.asset, c.usdPrice)).toBe(c.expected);
    });
  }
});

describe('formatUsd', () => {
  it('uses 2 fraction digits for cents and 6 below one cent', () => {
    expect(formatUsd(new BigNumber('1234.5'))).toBe('$1,234.50');
    expect(formatUsd(new BigNumber('0.0004'))).toBe('$0.0004');
  });
});

describe('hasNonNativePayments', () => {
  it('is true when any payment is not native', () => {
    expect(hasNonNativePayments([payment('1', NATIVE_DENOM)])).toBe(false);
    expect(hasNonNativePayments([])).toBe(false);
    expect(hasNonNativePayments([payment('1', NATIVE_DENOM), payment('1', token(USDC))])).toBe(
      true,
    );
    expect(hasNonNativePayments([payment('1', AMBIGUOUS_DENOM)])).toBe(true);
  });
});

describe('summarizePayments', () => {
  const getUsdPrice = (asset: PaymentAsset) => {
    if (asset.id === NATIVE_ASSET_ID) return 2000;
    return asset.coinGeckoId === 'usd-coin' ? 1 : null;
  };

  it('shows a single token payment in token units with the token price', () => {
    const totals = summarizePayments(
      [payment('212909', token(USDC))],
      ETH,
      TOKEN_METADATA,
      getUsdPrice,
    );

    expect(totals).toEqual([
      {
        id: USDC.toLowerCase(),
        label: 'Paid at dispatch:',
        display: '0.212909 USDC',
        usd: '$0.21',
      },
    ]);
  });

  it('hides USD for a token without a coinGeckoId and never uses the native price', () => {
    const metadata: Record<string, TokenMetadata> = {
      [USDC.toLowerCase()]: { symbol: 'USDC', decimals: 6 },
    };
    const totals = summarizePayments([payment('212909', token(USDC))], ETH, metadata, getUsdPrice);

    expect(totals[0].display).toBe('0.212909 USDC');
    expect(totals[0].usd).toBeNull();
  });

  it('sums payments per asset and labels each total when there are several', () => {
    const totals = summarizePayments(
      [
        payment('100000', token(USDC)),
        payment('300000000000000', NATIVE_DENOM),
        payment('112909', token(USDC)),
        payment('5', token(USDT)),
      ],
      ETH,
      TOKEN_METADATA,
      getUsdPrice,
    );

    expect(totals).toEqual([
      {
        id: USDC.toLowerCase(),
        label: 'Paid at dispatch (USDC):',
        display: '0.212909 USDC',
        usd: '$0.21',
      },
      {
        id: NATIVE_ASSET_ID,
        label: 'Paid at dispatch (ETH):',
        display: '0.0003 ETH',
        usd: '$0.60',
      },
      {
        id: USDT.toLowerCase(),
        label: `Paid at dispatch (${SHORT_USDT}):`,
        display: `5 raw units (${SHORT_USDT})`,
        usd: null,
      },
    ]);
  });

  it('shows an ambiguous payment in raw units without USD', () => {
    const totals = summarizePayments(
      [payment('212909', AMBIGUOUS_DENOM), payment('1', token(USDC))],
      ETH,
      TOKEN_METADATA,
      getUsdPrice,
    );

    expect(totals[0]).toEqual({
      id: 'ambiguous',
      label: 'Paid at dispatch (unknown token):',
      display: '212909 raw units (unknown token)',
      usd: null,
    });
  });

  it('sums raw amounts without exponent notation', () => {
    const totals = summarizePayments(
      [
        payment('600000000000000000000', NATIVE_DENOM),
        payment('600000000000000000000', NATIVE_DENOM),
      ],
      ETH,
      TOKEN_METADATA,
      getUsdPrice,
    );

    expect(totals[0].display).toBe('1200 ETH');
  });
});

describe('formatRawUnits', () => {
  it('labels base units, optionally with the unit they are in', () => {
    expect(formatRawUnits('212909')).toBe('212909 raw units');
    expect(formatRawUnits('212909', SHORT_USDT)).toBe(`212909 raw units (${SHORT_USDT})`);
  });
});

describe('sumPayments', () => {
  it('sums a field of the payments without exponent notation', () => {
    const payments = [
      payment('600000000000000000000', NATIVE_DENOM),
      payment('600000000000000000000', token(USDC)),
    ];

    expect(sumPayments(payments, 'paymentAmount').toFixed()).toBe('1200000000000000000000');
    expect(sumPayments(payments, 'gasAmount').toFixed()).toBe('461774');
    expect(sumPayments([], 'gasAmount').toFixed()).toBe('0');
  });
});

describe('getOtherPayments', () => {
  interface Case {
    name: string;
    numPayments: number;
    totalPaymentRaw: string;
    receiptPayments: IgpPayment[];
    expected: OtherPayments | undefined;
  }
  const cases: Case[] = [
    {
      name: 'every payment is in the receipt',
      numPayments: 1,
      totalPaymentRaw: '212909',
      receiptPayments: [payment('212909', token(USDC))],
      expected: undefined,
    },
    {
      name: 'the receipt has more payments than the message reports',
      numPayments: 0,
      totalPaymentRaw: '0',
      receiptPayments: [payment('212909', token(USDC))],
      expected: undefined,
    },
    {
      name: 'a payment is missing from the receipt',
      numPayments: 2,
      totalPaymentRaw: '425818',
      receiptPayments: [payment('212909', token(USDC))],
      expected: { count: 1, rawAmount: '212909' },
    },
    {
      name: 'several payments are missing from the receipt',
      numPayments: 4,
      totalPaymentRaw: '1000000',
      receiptPayments: [payment('212909', token(USDC))],
      expected: { count: 3, rawAmount: '787091' },
    },
    {
      name: 'the message total does not exceed the receipt total',
      numPayments: 2,
      totalPaymentRaw: '212909',
      receiptPayments: [payment('212909', token(USDC))],
      expected: { count: 1, rawAmount: undefined },
    },
  ];
  for (const c of cases) {
    it(`handles ${c.name}`, () => {
      expect(
        getOtherPayments(c.numPayments, new BigNumber(c.totalPaymentRaw), c.receiptPayments),
      ).toEqual(c.expected);
    });
  }
});

describe('formatOtherPayments', () => {
  it('describes the count and, when known, the raw amount', () => {
    expect(formatOtherPayments({ count: 1, rawAmount: '212909' })).toBe(
      '1 payment, 212909 raw units (unit unknown)',
    );
    expect(formatOtherPayments({ count: 3, rawAmount: '787091' })).toBe(
      '3 payments, 787091 raw units (unit unknown)',
    );
    expect(formatOtherPayments({ count: 2, rawAmount: undefined })).toBe(
      '2 payments (unit unknown)',
    );
  });
});
