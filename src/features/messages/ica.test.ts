import { BigNumber, utils } from 'ethers';

import { IcaCall } from '../../types';
import { decodeIcaCallData, decodeMulticallIcaCalls } from './ica';

const MULTICALL3_ADDRESS = '0xcA11bde05977b3631167028862bE2a173976CA11';
const TARGET_A = '0x1111111111111111111111111111111111111111';
const TARGET_B = '0x2222222222222222222222222222222222222222';
const TARGET_C = '0x3333333333333333333333333333333333333333';

function selector(signature: string) {
  return utils.id(signature).slice(0, 10);
}

function buildCall(data: string): IcaCall {
  return {
    to: MULTICALL3_ADDRESS,
    value: '0',
    data,
  };
}

describe('decodeMulticallIcaCalls', () => {
  it('decodes aggregate3 calls', () => {
    const data =
      selector('aggregate3((address,bool,bytes)[])') +
      utils.defaultAbiCoder
        .encode(
          ['tuple(address target, bool allowFailure, bytes callData)[]'],
          [
            [
              { target: TARGET_A, allowFailure: false, callData: '0x1234' },
              { target: TARGET_B, allowFailure: true, callData: '0xabcd' },
            ],
          ],
        )
        .slice(2);

    expect(decodeMulticallIcaCalls(buildCall(data), 'ethereum')).toEqual([
      { to: TARGET_A, value: '0', data: '0x1234' },
      { to: TARGET_B, value: '0', data: '0xabcd' },
    ]);
  });

  it('decodes aggregate3Value values', () => {
    const data =
      selector('aggregate3Value((address,bool,uint256,bytes)[])') +
      utils.defaultAbiCoder
        .encode(
          ['tuple(address target, bool allowFailure, uint256 value, bytes callData)[]'],
          [
            [
              {
                target: TARGET_A,
                allowFailure: false,
                value: BigNumber.from(5),
                callData: '0x1234',
              },
            ],
          ],
        )
        .slice(2);

    expect(decodeMulticallIcaCalls(buildCall(data), 'ethereum')).toEqual([
      { to: TARGET_A, value: '5', data: '0x1234' },
    ]);
  });

  it('returns null for non-multicall targets', () => {
    expect(
      decodeMulticallIcaCalls({ to: TARGET_A, value: '0', data: '0x1234' }, 'ethereum'),
    ).toBeNull();
  });
});

describe('decodeIcaCallData', () => {
  it('decodes ERC20 approve calls', () => {
    const iface = new utils.Interface(['function approve(address,uint256)']);
    const data = iface.encodeFunctionData('approve', [TARGET_A, utils.parseUnits('1.5', 18)]);

    expect(decodeIcaCallData(data)).toEqual({
      functionName: 'approve',
      summary: 'Approve 0x111...1111 to spend 1.5 tokens',
    });
  });

  it('formats decoded token amounts independently of browser locale', () => {
    const originalToLocaleString = Number.prototype.toLocaleString;
    Number.prototype.toLocaleString = function (locale?: string | string[], options?: object) {
      if (!locale) return 'locale-dependent';
      return originalToLocaleString.call(this, locale, options);
    };

    try {
      const iface = new utils.Interface(['function approve(address,uint256)']);
      const data = iface.encodeFunctionData('approve', [TARGET_A, utils.parseUnits('1.5', 18)]);

      expect(decodeIcaCallData(data)?.summary).toBe('Approve 0x111...1111 to spend 1.5 tokens');
    } finally {
      Number.prototype.toLocaleString = originalToLocaleString;
    }
  });

  it('decodes transferRemote calls', () => {
    const iface = new utils.Interface(['function transferRemote(uint32,bytes32,uint256)']);
    const recipient = utils.hexZeroPad(TARGET_B, 32);
    const data = iface.encodeFunctionData('transferRemote', [
      10,
      recipient,
      utils.parseUnits('2', 6),
    ]);

    expect(
      decodeIcaCallData(data, (domainId) => (domainId === 10 ? 'optimism' : undefined)),
    ).toEqual({
      functionName: 'transferRemote',
      summary: 'Bridge 2 tokens to 0x222...2222 on optimism',
    });
  });

  it('decodes Universal Router execute swap calls', () => {
    const iface = new utils.Interface(['function execute(bytes,bytes[])']);
    const input = utils.defaultAbiCoder.encode(
      ['address', 'uint256', 'uint256', 'bytes', 'bool'],
      [TARGET_A, 0, 0, '0x' + TARGET_A.slice(2) + '000bb8' + TARGET_B.slice(2), false],
    );
    const data = iface.encodeFunctionData('execute', ['0x00', [input]]);

    expect(decodeIcaCallData(data)).toMatchObject({
      functionName: 'swap',
      summary: 'Swap 0x111...1111 -> 0x222...2222',
      swap: {
        tokenIn: TARGET_A,
        tokenOut: TARGET_B,
      },
      details: [
        { label: 'Input token (origin):', value: TARGET_A },
        { label: 'Output token (destination):', value: TARGET_B },
      ],
    });
  });

  it('decodes Universal Router swap calls with command flags masked out', () => {
    const iface = new utils.Interface(['function execute(bytes,bytes[])']);
    const input = utils.defaultAbiCoder.encode(
      ['address', 'uint256', 'uint256', 'bytes', 'bool'],
      [TARGET_A, 0, 0, '0x' + TARGET_A.slice(2) + '000bb8' + TARGET_B.slice(2), false],
    );
    const data = iface.encodeFunctionData('execute', ['0xc0', [input]]);

    expect(decodeIcaCallData(data)).toMatchObject({
      functionName: 'swap',
      summary: 'Swap 0x111...1111 -> 0x222...2222',
      swap: {
        tokenIn: TARGET_A,
        tokenOut: TARGET_B,
      },
    });
  });

  it('decodes Universal Router exact-out output amounts', () => {
    const iface = new utils.Interface(['function execute(bytes,bytes[])']);
    const input = utils.defaultAbiCoder.encode(
      ['address', 'uint256', 'uint256', 'bytes', 'bool'],
      [
        TARGET_A,
        utils.parseUnits('3', 6),
        utils.parseUnits('1', 6),
        '0x' + TARGET_A.slice(2) + '000bb8' + TARGET_B.slice(2),
        false,
      ],
    );
    const data = iface.encodeFunctionData('execute', ['0x01', [input]]);

    expect(decodeIcaCallData(data)).toMatchObject({
      functionName: 'swap',
      swap: {
        tokenIn: TARGET_B,
        tokenOut: TARGET_A,
        outputAmount: '3000000',
        outputAmountKind: 'exact',
      },
    });
  });

  it('decodes Universal Router unwraps as native output', () => {
    const iface = new utils.Interface(['function execute(bytes,bytes[])']);
    const swapInput = utils.defaultAbiCoder.encode(
      ['address', 'uint256', 'uint256', 'bytes', 'bool', 'bool'],
      [TARGET_A, 0, 0, '0x' + TARGET_A.slice(2) + '000bb8' + TARGET_B.slice(2), false, true],
    );
    const unwrapInput = utils.defaultAbiCoder.encode(
      ['address', 'uint256'],
      [TARGET_C, utils.parseUnits('2', 6)],
    );
    const data = iface.encodeFunctionData('execute', ['0x000c', [swapInput, unwrapInput]]);

    expect(decodeIcaCallData(data)).toMatchObject({
      functionName: 'swap',
      summary: 'Swap 0x111...1111 -> native token',
      swap: {
        tokenIn: TARGET_A,
        tokenOut: 'native',
        tokenOutType: 'native',
        wrappedNativeToken: TARGET_B,
        outputAmount: '2000000',
        outputAmountKind: 'minimum',
      },
      details: [
        { label: 'Input token (origin):', value: TARGET_A },
        { label: 'Output token (destination):', value: 'Native token' },
      ],
    });
  });

  it('decodes Universal Router sub-plan swaps before unwraps', () => {
    const iface = new utils.Interface(['function execute(bytes,bytes[])']);
    const swapInput = utils.defaultAbiCoder.encode(
      ['address', 'uint256', 'uint256', 'bytes', 'bool', 'bool'],
      [TARGET_A, 0, 0, '0x' + TARGET_A.slice(2) + '000bb8' + TARGET_B.slice(2), false, true],
    );
    const subPlanInput = utils.defaultAbiCoder.encode(['bytes', 'bytes[]'], ['0x00', [swapInput]]);
    const unwrapInput = utils.defaultAbiCoder.encode(['address', 'uint256'], [TARGET_C, 0]);
    const data = iface.encodeFunctionData('execute', ['0xa10c', [subPlanInput, unwrapInput]]);

    expect(decodeIcaCallData(data)).toMatchObject({
      functionName: 'swap',
      summary: 'Swap 0x111...1111 -> native token',
      swap: {
        tokenIn: TARGET_A,
        tokenOut: 'native',
        tokenOutType: 'native',
      },
    });
  });

  it('uses Universal Router sweep token as output token', () => {
    const iface = new utils.Interface(['function execute(bytes,bytes[])']);
    const swapInput = utils.defaultAbiCoder.encode(
      ['address', 'uint256', 'uint256', 'bytes', 'bool', 'bool'],
      [TARGET_A, 0, 0, '0x' + TARGET_A.slice(2) + '000bb8' + TARGET_B.slice(2), false, true],
    );
    const sweepInput = utils.defaultAbiCoder.encode(
      ['address', 'address', 'uint256'],
      [TARGET_C, TARGET_A, 0],
    );
    const data = iface.encodeFunctionData('execute', ['0x0004', [swapInput, sweepInput]]);

    const decoded = decodeIcaCallData(data);

    expect(decoded).toMatchObject({
      functionName: 'swap',
      summary: 'Swap 0x111...1111 -> 0x333...3333',
      swap: {
        tokenIn: TARGET_A,
        tokenOut: TARGET_C,
      },
    });
    expect(decoded?.swap).not.toHaveProperty('tokenOutType');
  });

  it('clears native output state when a later Universal Router swap outputs a token', () => {
    const iface = new utils.Interface(['function execute(bytes,bytes[])']);
    const firstInput = utils.defaultAbiCoder.encode(
      ['address', 'uint256', 'uint256', 'bytes', 'bool', 'bool'],
      [TARGET_A, 0, 0, '0x' + TARGET_A.slice(2) + '000bb8' + TARGET_B.slice(2), false, true],
    );
    const unwrapInput = utils.defaultAbiCoder.encode(['address', 'uint256'], [TARGET_C, 0]);
    const secondInput = utils.defaultAbiCoder.encode(
      ['address', 'uint256', 'uint256', 'bytes', 'bool', 'bool'],
      [TARGET_A, 0, 0, '0x' + TARGET_B.slice(2) + '000bb8' + TARGET_C.slice(2), false, true],
    );
    const data = iface.encodeFunctionData('execute', [
      '0x000c00',
      [firstInput, unwrapInput, secondInput],
    ]);

    const decoded = decodeIcaCallData(data);

    expect(decoded).toMatchObject({
      functionName: 'swap',
      summary: 'Swap 0x111...1111 -> 0x333...3333',
      swap: {
        tokenIn: TARGET_A,
        tokenOut: TARGET_C,
      },
    });
    expect(decoded?.swap).not.toHaveProperty('tokenOutType');
  });

  it('keeps accumulated Universal Router route state when a non-swap command is malformed', () => {
    const iface = new utils.Interface(['function execute(bytes,bytes[])']);
    const swapInput = utils.defaultAbiCoder.encode(
      ['address', 'uint256', 'uint256', 'bytes', 'bool', 'bool'],
      [TARGET_A, 0, 0, '0x' + TARGET_A.slice(2) + '000bb8' + TARGET_B.slice(2), false, true],
    );
    const data = iface.encodeFunctionData('execute', ['0x0004', [swapInput, '0x1234']]);

    expect(decodeIcaCallData(data)).toMatchObject({
      functionName: 'swap',
      summary: 'Swap 0x111...1111 -> 0x222...2222',
      swap: {
        tokenIn: TARGET_A,
        tokenOut: TARGET_B,
      },
    });
  });

  it('decodes Universal Router V2 address-array paths', () => {
    const iface = new utils.Interface(['function execute(bytes,bytes[])']);
    const firstInput = utils.defaultAbiCoder.encode(
      ['address', 'uint256', 'uint256', 'bytes', 'bool', 'bool'],
      [TARGET_A, 0, 0, '0x' + TARGET_A.slice(2) + '000bb8' + TARGET_B.slice(2), false, true],
    );
    const secondInput = utils.defaultAbiCoder.encode(
      ['address', 'uint256', 'uint256', 'address[]', 'bool'],
      [TARGET_A, 0, 0, [TARGET_B, TARGET_C], false],
    );
    const data = iface.encodeFunctionData('execute', ['0x0008', [firstInput, secondInput]]);

    expect(decodeIcaCallData(data)).toMatchObject({
      functionName: 'swap',
      summary: 'Swap 0x111...1111 -> 0x333...3333',
      swap: {
        tokenIn: TARGET_A,
        tokenOut: TARGET_C,
      },
    });
  });

  it('keeps Universal Router V2 exact-out address-array paths in input-output order', () => {
    const iface = new utils.Interface(['function execute(bytes,bytes[])']);
    const firstInput = utils.defaultAbiCoder.encode(
      ['address', 'uint256', 'uint256', 'bytes', 'bool', 'bool'],
      [TARGET_A, 0, 0, '0x' + TARGET_A.slice(2) + '000bb8' + TARGET_B.slice(2), false, true],
    );
    const secondInput = utils.defaultAbiCoder.encode(
      ['address', 'uint256', 'uint256', 'address[]', 'bool'],
      [TARGET_A, 0, 0, [TARGET_B, TARGET_C], false],
    );
    const data = iface.encodeFunctionData('execute', ['0x0009', [firstInput, secondInput]]);

    expect(decodeIcaCallData(data)).toMatchObject({
      functionName: 'swap',
      summary: 'Swap 0x111...1111 -> 0x333...3333',
      swap: {
        tokenIn: TARGET_A,
        tokenOut: TARGET_C,
      },
    });
  });

  it('decodes Universal Router execute as a net multi-swap route', () => {
    const iface = new utils.Interface(['function execute(bytes,bytes[])']);
    const firstInput = utils.defaultAbiCoder.encode(
      ['address', 'uint256', 'uint256', 'bytes', 'bool'],
      [TARGET_A, 0, 0, '0x' + TARGET_A.slice(2) + '000bb8' + TARGET_B.slice(2), false],
    );
    const secondInput = utils.defaultAbiCoder.encode(
      ['address', 'uint256', 'uint256', 'bytes', 'bool'],
      [TARGET_B, 0, 0, '0x' + TARGET_B.slice(2) + '000bb8' + TARGET_C.slice(2), false],
    );
    const data = iface.encodeFunctionData('execute', ['0x0000', [firstInput, secondInput]]);

    expect(decodeIcaCallData(data)).toMatchObject({
      functionName: 'swap',
      summary: 'Swap 0x111...1111 -> 0x333...3333',
      swap: {
        tokenIn: TARGET_A,
        tokenOut: TARGET_C,
      },
    });
  });
});
