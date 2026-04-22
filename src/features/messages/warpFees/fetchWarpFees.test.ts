import { BigNumber, utils } from 'ethers';

import {
  parseIgpPaymentForMessage,
  parseSentTransferRemoteAmount,
  parseTotalTokenPulledFromUser,
  sliceLogsForMessage,
} from './fetchWarpFees';

const erc20Iface = new utils.Interface([
  'event Transfer(address indexed from, address indexed to, uint256 value)',
]);
const routerIface = new utils.Interface([
  'event SentTransferRemote(uint32 indexed destination, bytes32 indexed recipient, uint256 amountOrId)',
]);
const mailboxIface = new utils.Interface(['event DispatchId(bytes32 indexed messageId)']);
const igpIface = new utils.Interface([
  'event GasPayment(bytes32 indexed messageId, uint32 indexed destinationDomain, uint256 gasAmount, uint256 payment)',
]);

function makeTransferLog(from: string, to: string, value: BigNumber, address: string) {
  const log = erc20Iface.encodeEventLog(erc20Iface.getEvent('Transfer'), [from, to, value]);
  return { ...log, address };
}

function makeSentTransferRemoteLog(
  destination: number,
  recipient: string,
  amount: BigNumber,
  address: string,
) {
  const log = routerIface.encodeEventLog(routerIface.getEvent('SentTransferRemote'), [
    destination,
    recipient,
    amount,
  ]);
  return { ...log, address };
}

function makeDispatchIdLog(messageId: string, mailboxAddress: string) {
  const log = mailboxIface.encodeEventLog(mailboxIface.getEvent('DispatchId'), [messageId]);
  return { ...log, address: mailboxAddress };
}

function makeGasPaymentLog(
  messageId: string,
  destDomain: number,
  gasAmount: BigNumber,
  payment: BigNumber,
  igpAddress: string,
) {
  const log = igpIface.encodeEventLog(igpIface.getEvent('GasPayment'), [
    messageId,
    destDomain,
    gasAmount,
    payment,
  ]);
  return { ...log, address: igpAddress };
}

const ROUTER = utils.getAddress('0x1234567890123456789012345678901234567890');
const MAILBOX = utils.getAddress('0x2222222222222222222222222222222222222222');
const SENDER = utils.getAddress('0xabcdef0123456789abcdef0123456789abcdef01');
const TOKEN = utils.getAddress('0x000000000000000000000000000000000000dEaD');
const FEE_RECIPIENT = utils.getAddress('0x0000000000000000000000000000000000000fee');
const ZERO = '0x0000000000000000000000000000000000000000';
const RECIPIENT = '0x' + '00'.repeat(31) + '01';
const MSG_ID_1 = '0x' + '11'.repeat(32);
const MSG_ID_2 = '0x' + '22'.repeat(32);

describe('parseSentTransferRemoteAmount', () => {
  it('parses SentTransferRemote amount from router logs', () => {
    const amount = BigNumber.from('995000');
    const log = makeSentTransferRemoteLog(137, RECIPIENT, amount, ROUTER);
    const result = parseSentTransferRemoteAmount([log], ROUTER);
    expect(result?.eq(amount)).toBe(true);
  });

  it('returns null when no SentTransferRemote event exists', () => {
    const log = makeTransferLog(SENDER, ROUTER, BigNumber.from('1000000'), ROUTER);
    const result = parseSentTransferRemoteAmount([log], ROUTER);
    expect(result).toBeNull();
  });

  it('ignores events from other addresses', () => {
    const other = utils.getAddress('0x0000000000000000000000000000000000000001');
    const log = makeSentTransferRemoteLog(137, RECIPIENT, BigNumber.from('100'), other);
    const result = parseSentTransferRemoteAmount([log], ROUTER);
    expect(result).toBeNull();
  });
});

describe('parseTotalTokenPulledFromUser', () => {
  it('sums ERC20 transfers to router', () => {
    const logs = [
      makeTransferLog(SENDER, ROUTER, BigNumber.from('1000000'), TOKEN),
      makeTransferLog(SENDER, ROUTER, BigNumber.from('50000'), TOKEN),
    ];
    const result = parseTotalTokenPulledFromUser(logs, ROUTER, TOKEN);
    expect(result?.eq(BigNumber.from('1050000'))).toBe(true);
  });

  it('counts aggregator / intermediary pulls (from != tx.from)', () => {
    // Aggregator / vault contract pulls tokens on the user's behalf and
    // forwards to the router. The Transfer's `from` is the intermediary,
    // not the user's EOA — still a legitimate pull for this message.
    const aggregator = utils.getAddress('0x0000000000000000000000000000000000000042');
    const logs = [makeTransferLog(aggregator, ROUTER, BigNumber.from('1000000'), TOKEN)];
    const result = parseTotalTokenPulledFromUser(logs, ROUTER, TOKEN);
    expect(result?.eq(BigNumber.from('1000000'))).toBe(true);
  });

  it('ignores transfers to other addresses', () => {
    const other = utils.getAddress('0x0000000000000000000000000000000000000003');
    const logs = [makeTransferLog(SENDER, other, BigNumber.from('1000000'), TOKEN)];
    const result = parseTotalTokenPulledFromUser(logs, ROUTER, TOKEN);
    expect(result).toBeNull();
  });

  it('ignores transfers from a different token contract', () => {
    const otherToken = utils.getAddress('0x0000000000000000000000000000000000000099');
    const logs = [makeTransferLog(SENDER, ROUTER, BigNumber.from('1000000'), otherToken)];
    const result = parseTotalTokenPulledFromUser(logs, ROUTER, TOKEN);
    expect(result).toBeNull();
  });

  it('returns null when no matching transfers found', () => {
    const result = parseTotalTokenPulledFromUser([], ROUTER, TOKEN);
    expect(result).toBeNull();
  });

  it('sums synthetic burns (Transfer user→0x0)', () => {
    // HypERC20 synthetic: router IS the token; _transferFromSender burns from user.
    const synth = ROUTER;
    const logs = [makeTransferLog(SENDER, ZERO, BigNumber.from('5004'), synth)];
    const result = parseTotalTokenPulledFromUser(logs, synth, synth);
    expect(result?.eq(BigNumber.from('5004'))).toBe(true);
  });

  it('counts intermediary-initiated synthetic burns (Transfer aggregator→0x0)', () => {
    // User calls an aggregator which eventually burns on the synthetic router.
    // The burn's `from` is the intermediary, not the user's EOA.
    const synth = ROUTER;
    const intermediary = utils.getAddress('0x00000000000000000000000000000000000abcde');
    const logs = [makeTransferLog(intermediary, ZERO, BigNumber.from('751748260'), synth)];
    const result = parseTotalTokenPulledFromUser(logs, synth, synth);
    expect(result?.eq(BigNumber.from('751748260'))).toBe(true);
  });

  it('ignores mints (Transfer 0x0→feeRecipient) in synthetic fee flow', () => {
    const synth = ROUTER;
    const logs = [
      makeTransferLog(SENDER, ZERO, BigNumber.from('5004'), synth), // burn — counted
      makeTransferLog(ZERO, FEE_RECIPIENT, BigNumber.from('4'), synth), // mint — ignored
    ];
    const result = parseTotalTokenPulledFromUser(logs, synth, synth);
    expect(result?.eq(BigNumber.from('5004'))).toBe(true);
  });

  it('ignores wrapper-token mints to router (xERC20/lockbox routes)', () => {
    // Ethereum USDT → Igra: user pulls 200 USDT to router; router receives
    // 180e18 mint of a wrapper token. Only the user→router USDT transfer
    // should count — the mint has `from == 0x0`.
    const wrapper = utils.getAddress('0x00000000000000000000000000000000beef0001');
    const logs = [
      makeTransferLog(SENDER, ROUTER, BigNumber.from('200000000'), TOKEN), // 200 USDT
      makeTransferLog(ZERO, ROUTER, BigNumber.from('180000000000000000000'), wrapper), // 180e18 mint
    ];
    const result = parseTotalTokenPulledFromUser(logs, ROUTER, TOKEN);
    expect(result?.eq(BigNumber.from('200000000'))).toBe(true);
  });
});

describe('sliceLogsForMessage', () => {
  it('returns null when no matching DispatchId exists', () => {
    const logs = [makeDispatchIdLog(MSG_ID_1, MAILBOX)];
    expect(sliceLogsForMessage(logs, MSG_ID_2)).toBeNull();
  });

  it('returns all logs up to and including the matching DispatchId for a single-send tx', () => {
    const logs = [
      makeTransferLog(SENDER, ROUTER, BigNumber.from('1000050'), TOKEN),
      makeSentTransferRemoteLog(137, RECIPIENT, BigNumber.from('1000000'), ROUTER),
      makeDispatchIdLog(MSG_ID_1, MAILBOX),
    ];
    const slice = sliceLogsForMessage(logs, MSG_ID_1);
    expect(slice).toHaveLength(3);
  });

  it('isolates logs per message in a multi-send tx (second message)', () => {
    const logs = [
      // Message 1
      makeTransferLog(SENDER, ROUTER, BigNumber.from('1000050'), TOKEN),
      makeSentTransferRemoteLog(137, RECIPIENT, BigNumber.from('1000000'), ROUTER),
      makeDispatchIdLog(MSG_ID_1, MAILBOX),
      // Message 2
      makeTransferLog(SENDER, ROUTER, BigNumber.from('500025'), TOKEN),
      makeSentTransferRemoteLog(137, RECIPIENT, BigNumber.from('500000'), ROUTER),
      makeDispatchIdLog(MSG_ID_2, MAILBOX),
    ];

    const slice2 = sliceLogsForMessage(logs, MSG_ID_2);
    expect(slice2).toHaveLength(3);
    const sent = parseSentTransferRemoteAmount(slice2!, ROUTER);
    const total = parseTotalTokenPulledFromUser(slice2!, ROUTER, TOKEN);
    expect(sent?.eq(BigNumber.from('500000'))).toBe(true);
    expect(total?.eq(BigNumber.from('500025'))).toBe(true);
  });

  it('isolates logs per message in a multi-send tx (first message)', () => {
    const logs = [
      makeTransferLog(SENDER, ROUTER, BigNumber.from('1000050'), TOKEN),
      makeSentTransferRemoteLog(137, RECIPIENT, BigNumber.from('1000000'), ROUTER),
      makeDispatchIdLog(MSG_ID_1, MAILBOX),
      makeTransferLog(SENDER, ROUTER, BigNumber.from('500025'), TOKEN),
      makeSentTransferRemoteLog(137, RECIPIENT, BigNumber.from('500000'), ROUTER),
      makeDispatchIdLog(MSG_ID_2, MAILBOX),
    ];

    const slice1 = sliceLogsForMessage(logs, MSG_ID_1);
    expect(slice1).toHaveLength(3);
    const sent = parseSentTransferRemoteAmount(slice1!, ROUTER);
    const total = parseTotalTokenPulledFromUser(slice1!, ROUTER, TOKEN);
    expect(sent?.eq(BigNumber.from('1000000'))).toBe(true);
    expect(total?.eq(BigNumber.from('1000050'))).toBe(true);
  });

  it('is case-insensitive when matching messageId', () => {
    const logs = [makeDispatchIdLog(MSG_ID_1, MAILBOX)];
    const slice = sliceLogsForMessage(logs, MSG_ID_1.toUpperCase());
    expect(slice).toHaveLength(1);
  });
});

describe('parseIgpPaymentForMessage', () => {
  const IGP = utils.getAddress('0x0000000000000000000000000000000000000199');

  it('finds the GasPayment matching msgId', () => {
    const logs = [makeGasPaymentLog(MSG_ID_1, 1, BigNumber.from(210887), BigNumber.from(100), IGP)];
    const result = parseIgpPaymentForMessage(logs, MSG_ID_1);
    expect(result?.eq(BigNumber.from(100))).toBe(true);
  });

  it('ignores GasPayments for other messages', () => {
    const logs = [makeGasPaymentLog(MSG_ID_2, 1, BigNumber.from(210887), BigNumber.from(100), IGP)];
    const result = parseIgpPaymentForMessage(logs, MSG_ID_1);
    expect(result).toBeNull();
  });

  it('is case-insensitive when matching msgId', () => {
    const logs = [makeGasPaymentLog(MSG_ID_1, 1, BigNumber.from(1), BigNumber.from(42), IGP)];
    const result = parseIgpPaymentForMessage(logs, MSG_ID_1.toUpperCase());
    expect(result?.eq(BigNumber.from(42))).toBe(true);
  });

  it('returns null when no GasPayment events exist', () => {
    const logs = [makeDispatchIdLog(MSG_ID_1, MAILBOX)];
    const result = parseIgpPaymentForMessage(logs, MSG_ID_1);
    expect(result).toBeNull();
  });

  it('sums multiple GasPayments for the same message (top-ups)', () => {
    const logs = [
      makeGasPaymentLog(MSG_ID_1, 1, BigNumber.from(100000), BigNumber.from(100), IGP),
      makeGasPaymentLog(MSG_ID_1, 1, BigNumber.from(50000), BigNumber.from(50), IGP),
      // Other message in the same tx should not count.
      makeGasPaymentLog(MSG_ID_2, 1, BigNumber.from(25000), BigNumber.from(25), IGP),
    ];
    const result = parseIgpPaymentForMessage(logs, MSG_ID_1);
    expect(result?.eq(BigNumber.from(150))).toBe(true);
  });
});
