import { IsmType } from '@hyperlane-xyz/sdk';

import type {
  AggregationMetadataBuildResult,
  MetadataBuildResult,
  MultisigMetadataBuildResult,
  RoutingMetadataBuildResult,
  ValidatorInfo,
} from '../../debugger/metadataTypes';

export function isMultisigResult(
  result: MetadataBuildResult,
): result is MultisigMetadataBuildResult {
  return (
    result.type === IsmType.MERKLE_ROOT_MULTISIG ||
    result.type === IsmType.MESSAGE_ID_MULTISIG ||
    result.type === IsmType.STORAGE_MERKLE_ROOT_MULTISIG ||
    result.type === IsmType.STORAGE_MESSAGE_ID_MULTISIG
  );
}

export function isAggregationResult(
  result: MetadataBuildResult,
): result is AggregationMetadataBuildResult {
  return result.type === IsmType.AGGREGATION || result.type === IsmType.STORAGE_AGGREGATION;
}

export function isRoutingResult(result: MetadataBuildResult): result is RoutingMetadataBuildResult {
  return (
    result.type === IsmType.ROUTING ||
    result.type === IsmType.FALLBACK_ROUTING ||
    result.type === IsmType.AMOUNT_ROUTING ||
    result.type === IsmType.INTERCHAIN_ACCOUNT_ROUTING
  );
}

export function getSignedCount(result: MultisigMetadataBuildResult): number {
  return result.validators.filter((v) => v.status === 'signed').length;
}

export function getIsmTypeName(type: IsmType): string {
  const typeNames: Record<string, string> = {
    [IsmType.MERKLE_ROOT_MULTISIG]: 'Merkle Root Multisig',
    [IsmType.MESSAGE_ID_MULTISIG]: 'Multisig',
    [IsmType.STORAGE_MERKLE_ROOT_MULTISIG]: 'Storage Merkle Multisig',
    [IsmType.STORAGE_MESSAGE_ID_MULTISIG]: 'Storage Multisig',
    [IsmType.AGGREGATION]: 'Aggregation',
    [IsmType.STORAGE_AGGREGATION]: 'Storage Aggregation',
    [IsmType.ROUTING]: 'Routing',
    [IsmType.FALLBACK_ROUTING]: 'Fallback Routing',
    [IsmType.AMOUNT_ROUTING]: 'Amount Routing',
    [IsmType.INTERCHAIN_ACCOUNT_ROUTING]: 'ICA Routing',
    [IsmType.TRUSTED_RELAYER]: 'Trusted Relayer',
    [IsmType.TEST_ISM]: 'Test ISM',
    [IsmType.OP_STACK]: 'OP Stack',
    [IsmType.PAUSABLE]: 'Pausable',
    [IsmType.CCIP]: 'CCIP',
    [IsmType.ARB_L2_TO_L1]: 'Arb L2->L1',
    [IsmType.OFFCHAIN_LOOKUP]: 'Offchain Lookup',
  };
  return typeNames[type] || type;
}

export function getTypeBadgeColor(type: IsmType): string {
  if (type === IsmType.AGGREGATION || type === IsmType.STORAGE_AGGREGATION) {
    return 'bg-purple-100 text-purple-700';
  }
  if (
    type === IsmType.ROUTING ||
    type === IsmType.FALLBACK_ROUTING ||
    type === IsmType.AMOUNT_ROUTING ||
    type === IsmType.INTERCHAIN_ACCOUNT_ROUTING
  ) {
    return 'bg-orange-100 text-orange-700';
  }
  if (
    type === IsmType.MERKLE_ROOT_MULTISIG ||
    type === IsmType.MESSAGE_ID_MULTISIG ||
    type === IsmType.STORAGE_MERKLE_ROOT_MULTISIG ||
    type === IsmType.STORAGE_MESSAGE_ID_MULTISIG
  ) {
    return 'bg-blue-100 text-blue-700';
  }
  if (type === IsmType.OP_STACK) {
    return 'bg-red-100 text-red-700';
  }
  return 'bg-gray-100 text-gray-700';
}

/**
 * Extract validator info from a MetadataBuildResult, traversing nested ISMs.
 * Collects ALL multisig branches (aggregation ISMs may have multiple) and
 * merges them into a single list. Threshold is summed across branches so
 * hasQuorum is only true when every branch meets its own threshold.
 */
export function extractValidatorInfo(result: MetadataBuildResult | null | undefined): {
  validators: ValidatorInfo[];
  threshold: number;
} | null {
  if (!result) return null;

  const branches: { validators: ValidatorInfo[]; threshold: number }[] = [];
  collectMultisigBranches(result, branches);

  if (branches.length === 0) return null;
  if (branches.length === 1) return branches[0];

  // Merge all branches: concatenate validators, sum thresholds
  return {
    validators: branches.flatMap((b) => b.validators),
    threshold: branches.reduce((sum, b) => sum + b.threshold, 0),
  };
}

function collectMultisigBranches(
  result: MetadataBuildResult,
  out: { validators: ValidatorInfo[]; threshold: number }[],
) {
  if (isMultisigResult(result) && result.validators?.length > 0) {
    out.push({ validators: result.validators, threshold: result.threshold });
    return;
  }

  if (isAggregationResult(result) && result.modules) {
    for (const subModule of result.modules) {
      collectMultisigBranches(subModule, out);
    }
  }

  if (isRoutingResult(result) && result.selectedIsm) {
    collectMultisigBranches(result.selectedIsm, out);
  }
}
