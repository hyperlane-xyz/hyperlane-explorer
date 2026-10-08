import { utils } from 'ethers';

import {
  getIgpPaymentsStatus,
  IgpPayment,
  IgpPaymentDenom,
  IgpPaymentDenomKind,
  IgpPaymentsStatus,
  IgpPaymentsStatusValue,
  parseIgpPayments,
} from './igpPayments';

type Log = { address: string; topics: Array<string>; data: string };

const erc20Iface = new utils.Interface([
  'event Transfer(address indexed from, address indexed to, uint256 value)',
  'event Approval(address indexed owner, address indexed spender, uint256 value)',
]);
const igpIface = new utils.Interface([
  'event GasPayment(bytes32 indexed messageId, uint32 indexed destinationDomain, uint256 gasAmount, uint256 payment)',
]);
const mailboxIface = new utils.Interface(['event DispatchId(bytes32 indexed messageId)']);

function makeTransferLog(from: string, to: string, value: string, token: string): Log {
  const log = erc20Iface.encodeEventLog(erc20Iface.getEvent('Transfer'), [from, to, value]);
  return { address: token, topics: log.topics, data: log.data };
}

function makeApprovalLog(owner: string, spender: string, value: string, token: string): Log {
  const log = erc20Iface.encodeEventLog(erc20Iface.getEvent('Approval'), [owner, spender, value]);
  return { address: token, topics: log.topics, data: log.data };
}

function makeGasPaymentLog(msgId: string, gasAmount: string, payment: string, igp: string): Log {
  const log = igpIface.encodeEventLog(igpIface.getEvent('GasPayment'), [
    msgId,
    56,
    gasAmount,
    payment,
  ]);
  return { address: igp, topics: log.topics, data: log.data };
}

function makeDispatchIdLog(msgId: string, mailbox: string): Log {
  const log = mailboxIface.encodeEventLog(mailboxIface.getEvent('DispatchId'), [msgId]);
  return { address: mailbox, topics: log.topics, data: log.data };
}

const BASE_MSG_ID = '0xcdcf983bb5fd448c0cd42ca0d7c90c2db289ccdff5636571195a03db906eb379';
const MSG_ID_A = '0x' + 'aa'.repeat(32);
const MSG_ID_B = '0x' + 'bb'.repeat(32);
const BASE_IGP = '0xc3f23848ed2e04c0c6d41bd7804fa8f89f940b94';
const BASE_USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';

const IGP_BASE = utils.getAddress(BASE_IGP);
const IGP_ETHEREUM = utils.getAddress('0x9e6B1022bE9BBF5aFd152483DAD9b88911bC8611');
const USDC_BASE = utils.getAddress(BASE_USDC);
const USDC_ETHEREUM = utils.getAddress('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48');
const USDT_ETHEREUM = utils.getAddress('0xdAC17F958D2ee523a2206206994597C13D831ec7');
const ROUTER = utils.getAddress('0x5ff3c3aaD59b590e7989092bA37F02F263DB8791');
const USER = utils.getAddress('0x3f13c1351ac66ca0f4827c607a94c93c82ad0913');
const MAILBOX = utils.getAddress('0xea87ae93fa0019a82a727bfd3ebd1cfca8f64f1d');

const NATIVE: IgpPaymentDenom = { kind: IgpPaymentDenomKind.Native };
const AMBIGUOUS: IgpPaymentDenom = { kind: IgpPaymentDenomKind.Ambiguous };
const token = (address: string): IgpPaymentDenom => ({ kind: IgpPaymentDenomKind.Token, address });

function denoms(payments: IgpPayment[]) {
  return payments.map((p) => p.denom);
}

describe('parseIgpPayments', () => {
  // Logs 456, 457, 460, 462 and 463 of the origin tx of Base message 0xcdcf983b...
  // (212909 USDC units paid as IGP payment), as returned by eth_getTransactionReceipt.
  it('parses the real Base USDC receipt', () => {
    const logs: Log[] = [
      {
        address: BASE_USDC,
        topics: [
          '0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925',
          '0x0000000000000000000000005ff3c3aad59b590e7989092ba37f02f263db8791',
          '0x000000000000000000000000c3f23848ed2e04c0c6d41bd7804fa8f89f940b94',
        ],
        data: '0x0000000000000000000000000000000000000000000000000000000000033fad',
      },
      {
        address: BASE_USDC,
        topics: [
          '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
          '0x0000000000000000000000003f13c1351ac66ca0f4827c607a94c93c82ad0913',
          '0x0000000000000000000000005ff3c3aad59b590e7989092ba37f02f263db8791',
        ],
        data: '0x00000000000000000000000000000000000000000000000000000000001281ed',
      },
      {
        address: '0xea87ae93fa0019a82a727bfd3ebd1cfca8f64f1d',
        topics: ['0x788dbc1b7152732178210e7f4d9d010ef016f9eafbe66786bd7169f56e0c353a', BASE_MSG_ID],
        data: '0x',
      },
      {
        address: BASE_USDC,
        topics: [
          '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
          '0x0000000000000000000000005ff3c3aad59b590e7989092ba37f02f263db8791',
          '0x000000000000000000000000c3f23848ed2e04c0c6d41bd7804fa8f89f940b94',
        ],
        data: '0x0000000000000000000000000000000000000000000000000000000000033fad',
      },
      {
        address: BASE_IGP,
        topics: [
          '0x65695c3748edae85a24cc2c60b299b31f463050bc259150d2e5802ec8d11720a',
          BASE_MSG_ID,
          '0x0000000000000000000000000000000000000000000000000000000000000038',
        ],
        data: '0x00000000000000000000000000000000000000000000000000000000000385e70000000000000000000000000000000000000000000000000000000000033fad',
      },
    ];

    expect(parseIgpPayments(logs, BASE_MSG_ID)).toEqual([
      {
        gasAmount: '230887',
        paymentAmount: '212909',
        denom: token(BASE_USDC),
      },
    ]);
  });

  interface TokenCase {
    name: string;
    igp: string;
    token: string;
    payment: string;
  }
  const tokenCases: TokenCase[] = [
    { name: 'Ethereum USDT', igp: IGP_ETHEREUM, token: USDT_ETHEREUM, payment: '211709' },
    { name: 'Ethereum USDC', igp: IGP_ETHEREUM, token: USDC_ETHEREUM, payment: '211709' },
  ];
  for (const c of tokenCases) {
    it(`labels a ${c.name} payment with its token`, () => {
      const logs = [
        makeTransferLog(USER, ROUTER, '1211709', c.token),
        makeTransferLog(ROUTER, c.igp, c.payment, c.token),
        makeGasPaymentLog(MSG_ID_A, '230887', c.payment, c.igp),
      ];
      expect(parseIgpPayments(logs, MSG_ID_A)).toEqual([
        {
          gasAmount: '230887',
          paymentAmount: c.payment,
          denom: token(c.token),
        },
      ]);
    });
  }

  it('returns no payments when there is no GasPayment for the message', () => {
    const logs = [
      makeDispatchIdLog(MSG_ID_A, MAILBOX),
      makeGasPaymentLog(MSG_ID_B, '1', '2', IGP_BASE),
    ];
    expect(parseIgpPayments(logs, MSG_ID_A)).toEqual([]);
    expect(parseIgpPayments([], MSG_ID_A)).toEqual([]);
  });

  it('matches the message id case-insensitively', () => {
    const logs = [makeGasPaymentLog(MSG_ID_A, '1', '2', IGP_BASE)];
    expect(parseIgpPayments(logs, MSG_ID_A.toUpperCase().replace('0X', '0x'))).toHaveLength(1);
  });

  it('treats a payment without a preceding transfer as native', () => {
    const logs = [makeGasPaymentLog(MSG_ID_A, '230887', '300000000000000', IGP_BASE)];
    expect(parseIgpPayments(logs, MSG_ID_A)).toEqual([
      {
        gasAmount: '230887',
        paymentAmount: '300000000000000',
        denom: NATIVE,
      },
    ]);
  });

  it('does not overflow into exponent notation for large amounts', () => {
    const logs = [
      makeGasPaymentLog(MSG_ID_A, '1000000000000000000000', '2000000000000000000000', IGP_BASE),
    ];
    const [parsed] = parseIgpPayments(logs, MSG_ID_A);
    expect(parsed.gasAmount).toBe('1000000000000000000000');
    expect(parsed.paymentAmount).toBe('2000000000000000000000');
  });

  interface NativeCase {
    name: string;
    logs: Log[];
  }
  const payment = makeGasPaymentLog(MSG_ID_A, '230887', '212909', IGP_BASE);
  const erc721StyleTransfer: Log = {
    address: USDC_BASE,
    topics: [
      utils.id('Transfer(address,address,uint256)'),
      utils.hexZeroPad(ROUTER, 32),
      utils.hexZeroPad(IGP_BASE, 32),
      utils.hexZeroPad('0x033fad', 32),
    ],
    data: utils.hexZeroPad('0x033fad', 32),
  };
  const emptyDataTransfer: Log = {
    address: USDC_BASE,
    topics: [
      utils.id('Transfer(address,address,uint256)'),
      utils.hexZeroPad(ROUTER, 32),
      utils.hexZeroPad(IGP_BASE, 32),
    ],
    data: '0x',
  };
  const nativeCases: NativeCase[] = [
    {
      name: 'an Approval to the IGP with the same value',
      logs: [makeApprovalLog(ROUTER, IGP_BASE, '212909', USDC_BASE), payment],
    },
    {
      name: 'a Transfer to the IGP with a different value',
      logs: [makeTransferLog(ROUTER, IGP_BASE, '212908', USDC_BASE), payment],
    },
    {
      name: 'a Transfer of the same value to another address',
      logs: [makeTransferLog(ROUTER, USER, '212909', USDC_BASE), payment],
    },
    {
      name: 'an ERC721-style Transfer (4 topics) to the IGP',
      logs: [erc721StyleTransfer, payment],
    },
    {
      name: 'a Transfer to the IGP without a value',
      logs: [emptyDataTransfer, payment],
    },
    {
      name: 'a Transfer emitted after the GasPayment',
      logs: [payment, makeTransferLog(ROUTER, IGP_BASE, '212909', USDC_BASE)],
    },
    {
      name: 'a Transfer before an earlier GasPayment of another message',
      logs: [
        makeTransferLog(ROUTER, IGP_BASE, '212909', USDC_BASE),
        makeGasPaymentLog(MSG_ID_B, '230887', '212909', IGP_BASE),
        payment,
      ],
    },
  ];
  for (const c of nativeCases) {
    it(`treats a payment as native given ${c.name}`, () => {
      expect(denoms(parseIgpPayments(c.logs, MSG_ID_A))).toEqual([NATIVE]);
    });
  }

  it('attributes each message in a multi-message tx its own transfer', () => {
    const logs = [
      makeTransferLog(ROUTER, IGP_BASE, '212909', USDC_BASE),
      makeGasPaymentLog(MSG_ID_A, '230887', '212909', IGP_BASE),
      makeTransferLog(ROUTER, IGP_BASE, '212909', USDT_ETHEREUM),
      makeGasPaymentLog(MSG_ID_B, '230887', '212909', IGP_BASE),
    ];
    expect(denoms(parseIgpPayments(logs, MSG_ID_A))).toEqual([token(USDC_BASE)]);
    expect(denoms(parseIgpPayments(logs, MSG_ID_B))).toEqual([token(USDT_ETHEREUM)]);
  });

  it('parses several payments of one message, each with its own token', () => {
    const logs = [
      makeTransferLog(ROUTER, IGP_BASE, '212909', USDC_BASE),
      makeGasPaymentLog(MSG_ID_A, '230887', '212909', IGP_BASE),
      makeTransferLog(ROUTER, IGP_ETHEREUM, '211709', USDT_ETHEREUM),
      makeGasPaymentLog(MSG_ID_A, '100000', '211709', IGP_ETHEREUM),
    ];
    const payments = parseIgpPayments(logs, MSG_ID_A);
    expect(payments.map((p) => [p.gasAmount, p.paymentAmount])).toEqual([
      ['230887', '212909'],
      ['100000', '211709'],
    ]);
    expect(denoms(payments)).toEqual([token(USDC_BASE), token(USDT_ETHEREUM)]);
  });

  it('keeps native and token payments of one message apart', () => {
    const logs = [
      makeGasPaymentLog(MSG_ID_A, '50000', '100000000000000', IGP_BASE),
      makeTransferLog(ROUTER, IGP_BASE, '212909', USDC_BASE),
      makeGasPaymentLog(MSG_ID_A, '230887', '212909', IGP_BASE),
    ];
    expect(denoms(parseIgpPayments(logs, MSG_ID_A))).toEqual([NATIVE, token(USDC_BASE)]);
  });

  it('reports transfers of the same value from different tokens as ambiguous', () => {
    const logs = [
      makeTransferLog(ROUTER, IGP_BASE, '212909', USDC_BASE),
      makeTransferLog(ROUTER, IGP_BASE, '212909', USDT_ETHEREUM),
      payment,
    ];
    expect(denoms(parseIgpPayments(logs, MSG_ID_A))).toEqual([AMBIGUOUS]);
  });

  it('resolves several matching transfers from one token', () => {
    const logs = [
      makeTransferLog(ROUTER, IGP_BASE, '212909', USDC_BASE),
      makeTransferLog(USER, IGP_BASE, '212909', USDC_BASE),
      payment,
    ];
    expect(denoms(parseIgpPayments(logs, MSG_ID_A))).toEqual([token(USDC_BASE)]);
  });
});

describe('getIgpPaymentsStatus', () => {
  interface Case {
    name: string;
    isEnabled: boolean;
    hasInitFailed: boolean;
    isChainMetadataReady: boolean;
    isEvmOrigin: boolean;
    hasData: boolean;
    hasError: boolean;
    expected: IgpPaymentsStatusValue;
  }
  const cases: Case[] = [
    {
      name: 'the receipt is not wanted',
      isEnabled: false,
      hasInitFailed: false,
      isChainMetadataReady: true,
      isEvmOrigin: true,
      hasData: false,
      hasError: false,
      expected: IgpPaymentsStatus.Disabled,
    },
    {
      name: 'the receipt is not wanted even if data is cached',
      isEnabled: false,
      hasInitFailed: false,
      isChainMetadataReady: true,
      isEvmOrigin: true,
      hasData: true,
      hasError: true,
      expected: IgpPaymentsStatus.Disabled,
    },
    {
      name: 'the provider or chain metadata failed to load',
      isEnabled: true,
      hasInitFailed: true,
      isChainMetadataReady: true,
      isEvmOrigin: true,
      hasData: false,
      hasError: false,
      expected: IgpPaymentsStatus.Disabled,
    },
    {
      name: 'the load failed while the chain metadata is not ready',
      isEnabled: true,
      hasInitFailed: true,
      isChainMetadataReady: false,
      isEvmOrigin: false,
      hasData: false,
      hasError: false,
      expected: IgpPaymentsStatus.Disabled,
    },
    {
      name: 'the load failed even if data is cached',
      isEnabled: true,
      hasInitFailed: true,
      isChainMetadataReady: true,
      isEvmOrigin: true,
      hasData: true,
      hasError: false,
      expected: IgpPaymentsStatus.Disabled,
    },
    {
      name: 'the chain metadata is still loading',
      isEnabled: true,
      hasInitFailed: false,
      isChainMetadataReady: false,
      isEvmOrigin: false,
      hasData: false,
      hasError: false,
      expected: IgpPaymentsStatus.Pending,
    },
    {
      name: 'the chain metadata is reloading while data is cached',
      isEnabled: true,
      hasInitFailed: false,
      isChainMetadataReady: false,
      isEvmOrigin: true,
      hasData: true,
      hasError: false,
      expected: IgpPaymentsStatus.Pending,
    },
    {
      name: 'the origin chain is not EVM',
      isEnabled: true,
      hasInitFailed: false,
      isChainMetadataReady: true,
      isEvmOrigin: false,
      hasData: false,
      hasError: false,
      expected: IgpPaymentsStatus.Disabled,
    },
    {
      name: 'the receipt is being read',
      isEnabled: true,
      hasInitFailed: false,
      isChainMetadataReady: true,
      isEvmOrigin: true,
      hasData: false,
      hasError: false,
      expected: IgpPaymentsStatus.Pending,
    },
    {
      name: 'the receipt was read',
      isEnabled: true,
      hasInitFailed: false,
      isChainMetadataReady: true,
      isEvmOrigin: true,
      hasData: true,
      hasError: false,
      expected: IgpPaymentsStatus.Ready,
    },
    {
      name: 'a later refetch failed after the receipt was read',
      isEnabled: true,
      hasInitFailed: false,
      isChainMetadataReady: true,
      isEvmOrigin: true,
      hasData: true,
      hasError: true,
      expected: IgpPaymentsStatus.Ready,
    },
    {
      name: 'the receipt could not be read',
      isEnabled: true,
      hasInitFailed: false,
      isChainMetadataReady: true,
      isEvmOrigin: true,
      hasData: false,
      hasError: true,
      expected: IgpPaymentsStatus.Error,
    },
  ];
  for (const c of cases) {
    it(`is ${c.expected} when ${c.name}`, () => {
      expect(
        getIgpPaymentsStatus({
          isEnabled: c.isEnabled,
          hasInitFailed: c.hasInitFailed,
          isChainMetadataReady: c.isChainMetadataReady,
          isEvmOrigin: c.isEvmOrigin,
          hasData: c.hasData,
          hasError: c.hasError,
        }),
      ).toBe(c.expected);
    });
  }
});
