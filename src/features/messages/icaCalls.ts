import { IERC20__factory, TokenRouter__factory } from '@hyperlane-xyz/core';
import { utils } from 'ethers';

const callInterface = new utils.Interface([
  ...IERC20__factory.abi,
  ...TokenRouter__factory.abi.filter(
    (fragment) => fragment.type === 'function' && fragment.name === 'transferRemote',
  ),
  'function deposit() payable',
  'function withdraw(uint256 amount)',
  'function transferOwnership(address newOwner)',
]);

// Matches known signatures, not the target contract's verified ABI. Keep custom calls raw.
export function decodeIcaCall(data: string) {
  try {
    const decoded = callInterface.parseTransaction({ data });
    if (
      callInterface.encodeFunctionData(decoded.functionFragment, decoded.args).toLowerCase() !==
      data.toLowerCase()
    ) {
      return null;
    }
    return {
      signature: decoded.signature,
      args: decoded.functionFragment.inputs.map((input, i) => ({
        name: input.name.replace(/^_/, ''),
        type: input.type,
        value: String(decoded.args[i]),
      })),
    };
  } catch {
    return null;
  }
}
