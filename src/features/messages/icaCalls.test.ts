import { utils } from 'ethers';

import { decodeIcaCall } from './icaCalls';

const recipient = '0x1111111111111111111111111111111111111111';
const amount = '9007199254740993000';
const iface = new utils.Interface([
  'function transfer(address to, uint256 amount)',
  'function transferRemote(uint32 destination, bytes32 recipient, uint256 amount)',
  'function deposit() payable',
]);

it('decodes named token arguments without losing integer precision', () => {
  expect(decodeIcaCall(iface.encodeFunctionData('transfer', [recipient, amount]))).toEqual({
    signature: 'transfer(address,uint256)',
    args: [
      { name: 'to', type: 'address', value: recipient },
      { name: 'amount', type: 'uint256', value: amount },
    ],
  });
  const remote = decodeIcaCall(
    iface.encodeFunctionData('transferRemote', [8453, utils.hexZeroPad(recipient, 32), amount]),
  );
  expect(remote?.args.map(({ name, value }) => [name, value])).toEqual([
    ['destination', '8453'],
    ['recipient', utils.hexZeroPad(recipient, 32)],
    ['amount', amount],
  ]);
  expect(decodeIcaCall(iface.encodeFunctionData('deposit'))).toEqual({
    signature: 'deposit()',
    args: [],
  });
  // Approval from a delivered ICA reveal; preserve the full uint256 allowance.
  expect(
    decodeIcaCall(
      '0x095ea7b300000000000000000000000052dd779c1b5eeb54d5f218efa72d52117ca04115ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
    ),
  ).toEqual({
    signature: 'approve(address,uint256)',
    args: [
      { name: 'spender', type: 'address', value: '0x52dd779c1b5eeb54d5f218EfA72D52117ca04115' },
      { name: 'amount', type: 'uint256', value: ((1n << 256n) - 1n).toString() },
    ],
  });
});

it('keeps unknown, malformed and noncanonical calldata undecoded', () => {
  const valid = iface.encodeFunctionData('transfer', [recipient, amount]);
  for (const data of ['0x', '0x12345678', valid.slice(0, -2), valid + '00']) {
    expect(decodeIcaCall(data)).toBeNull();
  }
});
