import { bytes32ToAddress, fromWei, shortenAddress, strip0x } from '@hyperlane-xyz/utils';
import { BigNumber, utils } from 'ethers';

import { formatAmountWithCommas } from '../../../utils/amount';
import { DecodedIcaCallData } from './types';

const KNOWN_CALL_SELECTORS: Record<string, { name: string; sig: string }> = {
  '0x095ea7b3': { name: 'approve', sig: 'approve(address,uint256)' },
  '0xa9059cbb': { name: 'transfer', sig: 'transfer(address,uint256)' },
  '0x23b872dd': { name: 'transferFrom', sig: 'transferFrom(address,address,uint256)' },
  '0x81b4e8b4': { name: 'transferRemote', sig: 'transferRemote(uint32,bytes32,uint256)' },
  '0x51debffc': {
    name: 'transferRemote',
    sig: 'transferRemote(uint32,bytes32,uint256,bytes,address)',
  },
  '0x24856bc3': { name: 'execute', sig: 'execute(bytes,bytes[])' },
  '0x3593564c': { name: 'execute', sig: 'execute(bytes,bytes[],uint256)' },
};

function formatTokenAmount(amount: BigNumber): string {
  const formatted18 = fromWei(amount.toString(), 18);
  const parsed18 = Number.parseFloat(formatted18);

  if (parsed18 > 0 && parsed18 < 0.000001) return `${amount.toString()} raw units`;
  if (parsed18 === 0) return '0';
  return `${formatAmountWithCommas(formatted18)} tokens`;
}

// Hyperlane universal-router Commands.sol uses a 6-bit command mask and
// EXECUTE_SUB_PLAN = 0x21, which differs from upstream Uniswap Universal Router:
// https://github.com/hyperlane-xyz/universal-router
const UNIVERSAL_ROUTER_COMMAND_TYPE_MASK = 0x3f;
const UNIVERSAL_ROUTER_V3_SWAP_EXACT_IN = 0x00;
const UNIVERSAL_ROUTER_V3_SWAP_EXACT_OUT = 0x01;
const UNIVERSAL_ROUTER_V2_SWAP_EXACT_IN = 0x08;
const UNIVERSAL_ROUTER_V2_SWAP_EXACT_OUT = 0x09;
const UNIVERSAL_ROUTER_SWEEP = 0x04;
const UNIVERSAL_ROUTER_TRANSFER = 0x05;
const UNIVERSAL_ROUTER_PAY_PORTION = 0x06;
const UNIVERSAL_ROUTER_UNWRAP_WETH = 0x0c;
const UNIVERSAL_ROUTER_EXECUTE_SUB_PLAN = 0x21;
const NATIVE_TOKEN_SENTINEL = 'native' as const;

function decodeUniversalRouterPackedPath(input: string): string | null {
  for (const types of [
    ['address', 'uint256', 'uint256', 'bytes', 'bool', 'bool'],
    ['address', 'uint256', 'uint256', 'bytes', 'bool'],
  ]) {
    try {
      const args = utils.defaultAbiCoder.decode(types, input);
      const path = strip0x(args[3] as string);
      if (path.length >= 40) return path;
    } catch {
      // Try the next router input shape.
    }
  }
  return null;
}

function decodeUniversalRouterAddressPath(input: string): string[] | null {
  for (const types of [
    ['address', 'uint256', 'uint256', 'address[]', 'bool', 'bool'],
    ['address', 'uint256', 'uint256', 'address[]', 'bool'],
  ]) {
    try {
      const args = utils.defaultAbiCoder.decode(types, input);
      const path = args[3] as string[];
      if (path.length >= 2) return path;
    } catch {
      // Try the next router input shape.
    }
  }
  return null;
}

function decodeUniversalRouterSwapArgs(input: string, isV2: boolean) {
  for (const pathType of isV2 ? ['address[]'] : ['bytes']) {
    for (const hasExtraBool of [true, false]) {
      const types = [
        'address',
        'uint256',
        'uint256',
        pathType,
        'bool',
        ...(hasExtraBool ? ['bool'] : []),
      ];
      try {
        return utils.defaultAbiCoder.decode(types, input);
      } catch {
        // Try the next router input shape.
      }
    }
  }
  return null;
}

function decodeUniversalRouterSwapCommand(
  input: string,
  isExactIn: boolean,
  isV2: boolean,
): DecodedUniversalRouterSwapCommand | null {
  const args = decodeUniversalRouterSwapArgs(input, isV2);
  const outputAmount = args?.[isExactIn ? 2 : 1] as BigNumber | undefined;

  if (isV2) {
    const addressPath = decodeUniversalRouterAddressPath(input);
    if (addressPath) {
      return {
        tokenIn: addressPath[0],
        tokenOut: addressPath[addressPath.length - 1],
        outputAmount: outputAmount && !outputAmount.isZero() ? outputAmount.toString() : undefined,
        outputAmountKind:
          outputAmount && !outputAmount.isZero() ? (isExactIn ? 'minimum' : 'exact') : undefined,
        recipient: args?.[0] as string | undefined,
      };
    }
  }

  const path = decodeUniversalRouterPackedPath(input);
  if (!path) return null;

  const route = isExactIn
    ? { tokenIn: '0x' + path.slice(0, 40), tokenOut: '0x' + path.slice(-40) }
    : { tokenIn: '0x' + path.slice(-40), tokenOut: '0x' + path.slice(0, 40) };
  return {
    ...route,
    outputAmount: outputAmount && !outputAmount.isZero() ? outputAmount.toString() : undefined,
    outputAmountKind:
      outputAmount && !outputAmount.isZero() ? (isExactIn ? 'minimum' : 'exact') : undefined,
    recipient: args?.[0] as string | undefined,
  };
}

type DecodedUniversalRouterSwap = {
  tokenIn: string;
  tokenOut: string;
  tokenOutType?: 'token' | 'native';
  outputAmount?: string;
  outputAmountKind?: 'exact' | 'minimum';
  wrappedNativeToken?: string;
  outputRecipients?: string[];
};

type DecodedUniversalRouterSwapCommand = {
  tokenIn: string;
  tokenOut: string;
  outputAmount?: string;
  outputAmountKind?: 'exact' | 'minimum';
  recipient?: string;
};

type UniversalRouterPlanState = {
  tokenIn?: string;
  tokenOut?: string;
  tokenOutType?: 'native';
  outputAmount?: string;
  outputAmountKind?: 'exact' | 'minimum';
  wrappedNativeToken?: string;
  outputRecipients: string[];
};

function decodeUniversalRouterPlan(
  commandsBytes: string,
  inputs: string[],
  depth = 0,
): DecodedUniversalRouterSwap | null {
  if (depth > 4) return null;

  const commands = strip0x(commandsBytes);
  const state = createUniversalRouterPlanState();

  for (let i = 0; i < commands.length / 2; i++) {
    try {
      const command = Number.parseInt(commands.slice(i * 2, i * 2 + 2), 16);
      const commandType = command & UNIVERSAL_ROUTER_COMMAND_TYPE_MASK;
      const input = inputs[i];
      if (!input) continue;

      if (commandType === UNIVERSAL_ROUTER_EXECUTE_SUB_PLAN) {
        applySubPlanCommand(state, input, depth);
        continue;
      }

      const swapCommand = getUniversalRouterSwapCommand(commandType);
      if (swapCommand) {
        applySwapCommand(state, input, swapCommand);
        continue;
      }

      if (isSweepLikeCommand(commandType)) {
        applySweepLikeCommand(state, input, commandType);
        continue;
      }

      if (commandType === UNIVERSAL_ROUTER_UNWRAP_WETH) {
        applyUnwrapWethCommand(state, input);
      }
    } catch {
      continue;
    }
  }

  return toDecodedUniversalRouterSwap(state);
}

function createUniversalRouterPlanState(): UniversalRouterPlanState {
  return { outputRecipients: [] };
}

function getUniversalRouterSwapCommand(commandType: number) {
  if (
    commandType === UNIVERSAL_ROUTER_V3_SWAP_EXACT_IN ||
    commandType === UNIVERSAL_ROUTER_V2_SWAP_EXACT_IN
  ) {
    return {
      isExactIn: true,
      isV2: commandType === UNIVERSAL_ROUTER_V2_SWAP_EXACT_IN,
    };
  }

  if (
    commandType === UNIVERSAL_ROUTER_V3_SWAP_EXACT_OUT ||
    commandType === UNIVERSAL_ROUTER_V2_SWAP_EXACT_OUT
  ) {
    return {
      isExactIn: false,
      isV2: commandType === UNIVERSAL_ROUTER_V2_SWAP_EXACT_OUT,
    };
  }

  return null;
}

function applySubPlanCommand(state: UniversalRouterPlanState, input: string, depth: number) {
  const [subCommands, subInputs] = utils.defaultAbiCoder.decode(['bytes', 'bytes[]'], input) as [
    string,
    string[],
  ];
  const subSwap = decodeUniversalRouterPlan(subCommands, subInputs, depth + 1);
  if (!subSwap) return;

  state.tokenIn ??= subSwap.tokenIn;
  state.tokenOut = subSwap.tokenOut;
  state.tokenOutType = subSwap.tokenOutType === 'native' ? 'native' : undefined;
  state.outputAmount = subSwap.outputAmount;
  state.outputAmountKind = subSwap.outputAmountKind;
  state.wrappedNativeToken = subSwap.wrappedNativeToken;
  state.outputRecipients = subSwap.outputRecipients ?? [];
}

function applySwapCommand(
  state: UniversalRouterPlanState,
  input: string,
  command: { isExactIn: boolean; isV2: boolean },
) {
  const decodedSwap = decodeUniversalRouterSwapCommand(input, command.isExactIn, command.isV2);
  if (!decodedSwap) return;

  state.tokenIn ??= decodedSwap.tokenIn;
  state.tokenOut = decodedSwap.tokenOut;
  state.tokenOutType = undefined;
  state.outputAmount = decodedSwap.outputAmount;
  state.outputAmountKind = decodedSwap.outputAmountKind;
  state.wrappedNativeToken = undefined;
  state.outputRecipients = decodedSwap.recipient ? [decodedSwap.recipient] : [];
}

function isSweepLikeCommand(commandType: number) {
  return (
    commandType === UNIVERSAL_ROUTER_SWEEP ||
    commandType === UNIVERSAL_ROUTER_TRANSFER ||
    commandType === UNIVERSAL_ROUTER_PAY_PORTION
  );
}

function applySweepLikeCommand(
  state: UniversalRouterPlanState,
  input: string,
  commandType: number,
) {
  if (!state.tokenIn) return;

  const args = utils.defaultAbiCoder.decode(['address', 'address', 'uint256'], input);
  const amount = args[2] as BigNumber;
  const outputAmount =
    (commandType === UNIVERSAL_ROUTER_TRANSFER || commandType === UNIVERSAL_ROUTER_SWEEP) &&
    !amount.isZero()
      ? amount.toString()
      : undefined;

  state.tokenOut = args[0] as string;
  state.tokenOutType = undefined;
  state.wrappedNativeToken = undefined;
  state.outputAmount = outputAmount;
  state.outputAmountKind =
    commandType === UNIVERSAL_ROUTER_TRANSFER && outputAmount
      ? 'exact'
      : commandType === UNIVERSAL_ROUTER_SWEEP && outputAmount
        ? 'minimum'
        : undefined;
  state.outputRecipients = [args[1] as string];
}

function applyUnwrapWethCommand(state: UniversalRouterPlanState, input: string) {
  if (!state.tokenOut) return;

  const args = utils.defaultAbiCoder.decode(['address', 'uint256'], input);
  const outputAmount = !(args[1] as BigNumber).isZero()
    ? (args[1] as BigNumber).toString()
    : undefined;

  state.wrappedNativeToken = state.tokenOut;
  state.tokenOut = NATIVE_TOKEN_SENTINEL;
  state.tokenOutType = 'native';
  state.outputAmount = outputAmount;
  state.outputAmountKind = outputAmount ? 'minimum' : undefined;
  state.outputRecipients = [args[0] as string];
}

function toDecodedUniversalRouterSwap(
  state: UniversalRouterPlanState,
): DecodedUniversalRouterSwap | null {
  if (!state.tokenIn || !state.tokenOut) return null;

  return {
    tokenIn: state.tokenIn,
    tokenOut: state.tokenOut,
    ...(state.tokenOutType ? { tokenOutType: state.tokenOutType } : {}),
    ...(state.outputAmount ? { outputAmount: state.outputAmount } : {}),
    ...(state.outputAmountKind ? { outputAmountKind: state.outputAmountKind } : {}),
    ...(state.wrappedNativeToken ? { wrappedNativeToken: state.wrappedNativeToken } : {}),
    ...(state.outputRecipients.length ? { outputRecipients: state.outputRecipients } : {}),
  };
}

function decodeUniversalRouterSwap(
  data: string,
  functionName: 'execute(bytes,bytes[])' | 'execute(bytes,bytes[],uint256)',
): DecodedUniversalRouterSwap | null {
  try {
    const routerInterface = new utils.Interface([`function ${functionName}`]);
    const decoded = routerInterface.decodeFunctionData('execute', data);
    return decodeUniversalRouterPlan(decoded[0] as string, decoded[1] as string[]);
  } catch {
    return null;
  }
}

export function decodeIcaCallData(
  data: string,
  tryGetChainName?: (domainId: number) => string | undefined,
): DecodedIcaCallData | null {
  if (!data || data.length < 10) return null;

  const selector = data.slice(0, 10).toLowerCase();
  const known = KNOWN_CALL_SELECTORS[selector];
  if (!known) return null;

  try {
    const iface = new utils.Interface([`function ${known.sig}`]);
    const decoded = iface.decodeFunctionData(known.name, data);

    switch (known.sig) {
      case 'approve(address,uint256)': {
        const spender = shortenAddress(decoded[0] as string);
        const amount = formatTokenAmount(decoded[1] as BigNumber);
        return {
          functionName: 'approve',
          summary: `Approve ${spender} to spend ${amount}`,
        };
      }
      case 'transfer(address,uint256)': {
        const recipient = shortenAddress(decoded[0] as string);
        const amount = formatTokenAmount(decoded[1] as BigNumber);
        return {
          functionName: 'transfer',
          summary: `Transfer ${amount} to ${recipient}`,
        };
      }
      case 'transferFrom(address,address,uint256)': {
        const sender = shortenAddress(decoded[0] as string);
        const recipient = shortenAddress(decoded[1] as string);
        const amount = formatTokenAmount(decoded[2] as BigNumber);
        return {
          functionName: 'transferFrom',
          summary: `Transfer ${amount} from ${sender} to ${recipient}`,
        };
      }
      case 'transferRemote(uint32,bytes32,uint256)':
      case 'transferRemote(uint32,bytes32,uint256,bytes,address)': {
        const destinationDomain = BigNumber.from(decoded[0]).toNumber();
        const recipient = shortenAddress(bytes32ToAddress(decoded[1] as string));
        const amount = formatTokenAmount(decoded[2] as BigNumber);
        const destination = tryGetChainName?.(destinationDomain) || `domain ${destinationDomain}`;
        return {
          functionName: 'transferRemote',
          summary: `Bridge ${amount} to ${recipient} on ${destination}`,
        };
      }
      case 'execute(bytes,bytes[])':
      case 'execute(bytes,bytes[],uint256)': {
        const swap = decodeUniversalRouterSwap(data, known.sig);
        if (!swap) return { functionName: 'execute', summary: 'Universal Router execute' };
        const outputDisplay =
          swap.tokenOutType === 'native' ? 'native token' : shortenAddress(swap.tokenOut);
        return {
          functionName: 'swap',
          summary: `Swap ${shortenAddress(swap.tokenIn)} -> ${outputDisplay}`,
          swap,
          details: [
            { label: 'Input token (origin):', value: swap.tokenIn },
            {
              label: 'Output token (destination):',
              value: swap.tokenOutType === 'native' ? 'Native token' : swap.tokenOut,
            },
          ],
        };
      }
      default:
        return null;
    }
  } catch {
    return null;
  }
}
