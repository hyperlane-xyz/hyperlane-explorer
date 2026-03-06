import { BigNumber, utils } from 'ethers';

import { parseSentTransferRemoteAmount, parseTotalErc20TransferredToRouter } from './fetchWarpFees';

const erc20Iface = new utils.Interface([
  'event Transfer(address indexed from, address indexed to, uint256 value)',
]);
const routerIface = new utils.Interface([
  'event SentTransferRemote(uint32 indexed destination, bytes32 indexed recipient, uint256 amountOrId)',
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

const ROUTER = utils.getAddress('0x1234567890123456789012345678901234567890');
const SENDER = utils.getAddress('0xabcdef0123456789abcdef0123456789abcdef01');
const RECIPIENT = '0x' + '00'.repeat(31) + '01';

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

describe('parseTotalErc20TransferredToRouter', () => {
  it('sums ERC20 transfers from sender to router', () => {
    const logs = [
      makeTransferLog(SENDER, ROUTER, BigNumber.from('1000000'), ROUTER),
      makeTransferLog(SENDER, ROUTER, BigNumber.from('50000'), ROUTER),
    ];
    const result = parseTotalErc20TransferredToRouter(logs, ROUTER, SENDER);
    expect(result?.eq(BigNumber.from('1050000'))).toBe(true);
  });

  it('ignores transfers from other senders', () => {
    const other = utils.getAddress('0x0000000000000000000000000000000000000002');
    const logs = [makeTransferLog(other, ROUTER, BigNumber.from('1000000'), ROUTER)];
    const result = parseTotalErc20TransferredToRouter(logs, ROUTER, SENDER);
    expect(result).toBeNull();
  });

  it('ignores transfers to other addresses', () => {
    const other = utils.getAddress('0x0000000000000000000000000000000000000003');
    const logs = [makeTransferLog(SENDER, other, BigNumber.from('1000000'), other)];
    const result = parseTotalErc20TransferredToRouter(logs, ROUTER, SENDER);
    expect(result).toBeNull();
  });

  it('returns null when no matching transfers found', () => {
    const result = parseTotalErc20TransferredToRouter([], ROUTER, SENDER);
    expect(result).toBeNull();
  });
});
