import { chainAddresses } from '@hyperlane-xyz/registry';
import { BigNumber, utils } from 'ethers';

import { IcaCall } from '../../../types';
import { logger } from '../../../utils/logger';

// Multicall3 canonical address (deployed on 70+ chains at the same address)
const MULTICALL3_ADDRESS = '0xcA11bde05977b3631167028862bE2a173976CA11';

// Common Multicall3 function signatures
const MULTICALL_SIGNATURES = {
  // aggregate3: (Call3[] calldata calls) -> (Result[] memory returnData)
  // where Call3 = { target, allowFailure, callData }
  aggregate3: 'aggregate3((address,bool,bytes)[])',
  // aggregate3Value: (Call3Value[] calldata calls) -> (Result[] memory returnData)
  // where Call3Value = { target, allowFailure, value, callData }
  aggregate3Value: 'aggregate3Value((address,bool,uint256,bytes)[])',
  // tryAggregate: (bool requireSuccess, Call[] calldata calls) -> (Result[] memory returnData)
  tryAggregate: 'tryAggregate(bool,(address,bytes)[])',
  // aggregate: (Call[] calldata calls) -> (uint256 blockNumber, bytes[] memory returnData)
  aggregate: 'aggregate((address,bytes)[])',
};

/**
 * Get the mailbox address for a chain from the registry
 */
export function getMailboxAddress(chainName: string): Address | undefined {
  const addresses = chainAddresses[chainName as keyof typeof chainAddresses];
  return (addresses as Record<string, string> | undefined)?.mailbox;
}

/**
 * Get the batch contract address for a chain from the registry (if available)
 */
function getBatchContractAddress(chainName: string): Address | undefined {
  const addresses = chainAddresses[chainName as keyof typeof chainAddresses];
  return (addresses as Record<string, string> | undefined)?.batchContractAddress;
}

/**
 * Check if an address is a known multicall/batch contract
 */
export function isMulticallAddress(address: Address, chainName: string): boolean {
  const normalizedAddress = address.toLowerCase();

  // Check canonical Multicall3 address
  if (normalizedAddress === MULTICALL3_ADDRESS.toLowerCase()) {
    return true;
  }

  // Check chain-specific batch contract address from registry
  const batchContract = getBatchContractAddress(chainName);
  if (batchContract && normalizedAddress === batchContract.toLowerCase()) {
    return true;
  }

  return false;
}

export function tryDecodeMulticallCalls(txData: string): IcaCall[] | null {
  try {
    const selector = txData.slice(0, 10);

    if (selector === utils.id(MULTICALL_SIGNATURES.aggregate3).slice(0, 10)) {
      const decoded = utils.defaultAbiCoder.decode(
        ['tuple(address target, bool allowFailure, bytes callData)[]'],
        '0x' + txData.slice(10),
      );
      const calls = decoded[0] as Array<{
        target: string;
        callData: string;
      }>;
      return calls.map((call) => ({ to: call.target, value: '0', data: call.callData }));
    }

    if (selector === utils.id(MULTICALL_SIGNATURES.aggregate3Value).slice(0, 10)) {
      const decoded = utils.defaultAbiCoder.decode(
        ['tuple(address target, bool allowFailure, uint256 value, bytes callData)[]'],
        '0x' + txData.slice(10),
      );
      const calls = decoded[0] as Array<{
        target: string;
        value: BigNumber;
        callData: string;
      }>;
      return calls.map((call) => ({
        to: call.target,
        value: call.value.toString(),
        data: call.callData,
      }));
    }

    if (selector === utils.id(MULTICALL_SIGNATURES.tryAggregate).slice(0, 10)) {
      const decoded = utils.defaultAbiCoder.decode(
        ['bool', 'tuple(address target, bytes callData)[]'],
        '0x' + txData.slice(10),
      );
      const calls = decoded[1] as Array<{ target: string; callData: string }>;
      return calls.map((call) => ({ to: call.target, value: '0', data: call.callData }));
    }

    if (selector === utils.id(MULTICALL_SIGNATURES.aggregate).slice(0, 10)) {
      const decoded = utils.defaultAbiCoder.decode(
        ['tuple(address target, bytes callData)[]'],
        '0x' + txData.slice(10),
      );
      const calls = decoded[0] as Array<{ target: string; callData: string }>;
      return calls.map((call) => ({ to: call.target, value: '0', data: call.callData }));
    }
  } catch (error) {
    logger.debug('Failed to decode multicall calls', error);
  }

  return null;
}

export function decodeMulticallIcaCalls(
  call: IcaCall,
  destinationChainName: string | undefined,
): IcaCall[] | null {
  if (!destinationChainName || !isMulticallAddress(call.to, destinationChainName)) return null;
  return tryDecodeMulticallCalls(call.data);
}
