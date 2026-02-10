import type {
  AggregationMetadataBuildResult,
  MetadataBuildResult,
  MultisigMetadataBuildResult,
  RoutingMetadataBuildResult,
  ValidatorInfo,
} from '@hyperlane-xyz/sdk';
import { IsmType } from '@hyperlane-xyz/sdk';
import { shortenAddress } from '@hyperlane-xyz/utils';
import { Tooltip } from '@hyperlane-xyz/widgets';
import { useState } from 'react';
import { SectionCard } from '../../../components/layout/SectionCard';
import { docLinks } from '../../../consts/links';

interface Props {
  result: MetadataBuildResult | null | undefined;
  blur: boolean;
}

export function IsmDetailsCard({ result, blur }: Props) {
  if (!result) return null;

  return (
    <SectionCard
      className="w-full"
      title="Interchain Security Modules"
      icon={
        <Tooltip
          id="ism-info"
          content="Details about the Interchain Security Modules (ISM) that must verify this message."
        />
      }
    >
      <div className="space-y-4">
        <p className="text-sm font-light">
          Interchain Security Modules define the rules for verifying messages before delivery.{' '}
          <a
            href={docLinks.ism}
            target="_blank"
            rel="noopener noreferrer"
            className="cursor-pointer text-primary-600 transition-all hover:text-primary-500 active:text-primary-400"
          >
            Learn more about ISMs.
          </a>
        </p>
        <div className={`space-y-2 ${blur ? 'blur-xs' : ''}`}>
          <IsmTreeNode result={result} depth={0} />
        </div>
      </div>
    </SectionCard>
  );
}

function IsmTreeNode({ result, depth }: { result: MetadataBuildResult; depth: number }) {
  const [expanded, setExpanded] = useState(depth < 2);

  const isMultisig = isMultisigResult(result);
  const isAggregation = isAggregationResult(result);
  const isRouting = isRoutingResult(result);
  const hasChildren = isAggregation || isRouting;

  const typeName = getIsmTypeName(result.type);
  const badgeColor = getTypeBadgeColor(result.type);

  return (
    <div className={`${depth > 0 ? 'ml-4 border-l-2 border-gray-200 pl-3' : ''}`}>
      <div
        className={`flex items-center space-x-2 py-1 ${hasChildren || isMultisig ? 'cursor-pointer' : ''}`}
        onClick={() => (hasChildren || isMultisig) && setExpanded(!expanded)}
      >
        {/* Expand/collapse indicator */}
        {(hasChildren || isMultisig) && (
          <span className="w-3 text-xs text-gray-400">{expanded ? '▼' : '▶'}</span>
        )}

        {/* ISM type badge */}
        <span className={`rounded px-2 py-0.5 text-xs font-medium ${badgeColor}`}>
          {typeName}
          {isAggregation && ` (${(result as AggregationMetadataBuildResult).threshold})`}
          {isMultisig && ` (${(result as MultisigMetadataBuildResult).threshold})`}
        </span>

        {/* Address */}
        <span className="font-mono text-xs text-gray-500">{shortenAddress(result.ismAddress)}</span>

        {/* Validator count for multisig */}
        {isMultisig && (result as MultisigMetadataBuildResult).validators && (
          <span className="text-xs text-gray-500">
            ({getSignedCount(result as MultisigMetadataBuildResult)}/
            {(result as MultisigMetadataBuildResult).validators.length} signed,{' '}
            {(result as MultisigMetadataBuildResult).threshold} required)
          </span>
        )}

        {/* Metadata status indicator */}
        {result.metadata !== undefined && <span className="text-xs text-green-600">✓ ready</span>}
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="mt-1">
          {/* Validators for multisig */}
          {isMultisig && (result as MultisigMetadataBuildResult).validators && (
            <div className="mb-2 ml-6">
              <ValidatorList
                validators={(result as MultisigMetadataBuildResult).validators}
                threshold={(result as MultisigMetadataBuildResult).threshold}
              />
            </div>
          )}

          {/* Sub-modules for aggregation */}
          {isAggregation && (result as AggregationMetadataBuildResult).modules && (
            <div className="space-y-1">
              {(result as AggregationMetadataBuildResult).modules.map((subModule, index) => (
                <IsmTreeNode
                  key={subModule.ismAddress || index}
                  result={subModule}
                  depth={depth + 1}
                />
              ))}
            </div>
          )}

          {/* Selected ISM for routing */}
          {isRouting && (result as RoutingMetadataBuildResult).selectedIsm && (
            <div className="space-y-1">
              <span className="ml-6 text-xs text-gray-500">Routes to:</span>
              <IsmTreeNode
                result={(result as RoutingMetadataBuildResult).selectedIsm}
                depth={depth + 1}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ValidatorList({
  validators,
  threshold,
}: {
  validators: ValidatorInfo[];
  threshold: number;
}) {
  const signedCount = validators.filter((v) => v.status === 'signed').length;
  const hasQuorum = signedCount >= threshold;

  return (
    <div className="space-y-2">
      {/* Progress bar */}
      <div className="flex items-center space-x-2">
        <div className="relative h-2 flex-1 rounded-full bg-gray-200">
          {/* Threshold marker */}
          {validators.length > 0 && (
            <div
              className="absolute left-0 top-0 h-full rounded-full bg-blue-200"
              style={{ width: `${(threshold / validators.length) * 100}%` }}
            />
          )}
          {/* Signed progress */}
          {signedCount > 0 && validators.length > 0 && (
            <div
              className={`absolute left-0 top-0 h-full rounded-full transition-all duration-300 ${
                hasQuorum ? 'bg-green-500' : 'bg-blue-500'
              }`}
              style={{ width: `${(signedCount / validators.length) * 100}%` }}
            />
          )}
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            hasQuorum ? 'bg-green-100 text-green-800' : 'bg-primary-25 text-primary-800'
          }`}
        >
          {signedCount}/{validators.length} ({threshold} required)
        </span>
      </div>

      {/* Validator rows */}
      <div className="space-y-1">
        {validators.map((validator, index) => (
          <ValidatorRow key={validator.address || index} validator={validator} />
        ))}
      </div>
    </div>
  );
}

function ValidatorRow({ validator }: { validator: ValidatorInfo }) {
  const statusIcon = validator.status === 'signed' ? '✓' : validator.status === 'error' ? '✗' : '•';
  const statusColor =
    validator.status === 'signed'
      ? 'text-green-600'
      : validator.status === 'error'
        ? 'text-red-500'
        : 'text-gray-400';

  return (
    <div className="flex items-center justify-between rounded border border-gray-100 bg-white px-2 py-1 text-xs">
      <div className="flex items-center space-x-2">
        <span className={`font-medium ${statusColor}`}>{statusIcon}</span>
        <span className="font-mono text-gray-700">{shortenAddress(validator.address)}</span>
        {validator.alias && <span className="text-gray-500">({validator.alias})</span>}
      </div>
      {/* Show status badge for signed validators */}
      {validator.status === 'signed' && (
        <span className="rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-700">signed</span>
      )}
      {validator.status === 'error' && (
        <span
          className="rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-700"
          title={validator.error}
        >
          error
        </span>
      )}
    </div>
  );
}

// Helper functions

function isMultisigResult(result: MetadataBuildResult): result is MultisigMetadataBuildResult {
  return (
    result.type === IsmType.MERKLE_ROOT_MULTISIG ||
    result.type === IsmType.MESSAGE_ID_MULTISIG ||
    result.type === IsmType.STORAGE_MERKLE_ROOT_MULTISIG ||
    result.type === IsmType.STORAGE_MESSAGE_ID_MULTISIG
  );
}

function isAggregationResult(
  result: MetadataBuildResult,
): result is AggregationMetadataBuildResult {
  return result.type === IsmType.AGGREGATION || result.type === IsmType.STORAGE_AGGREGATION;
}

function isRoutingResult(result: MetadataBuildResult): result is RoutingMetadataBuildResult {
  return (
    result.type === IsmType.ROUTING ||
    result.type === IsmType.FALLBACK_ROUTING ||
    result.type === IsmType.AMOUNT_ROUTING ||
    result.type === IsmType.INTERCHAIN_ACCOUNT_ROUTING
  );
}

function getSignedCount(result: MultisigMetadataBuildResult): number {
  return result.validators.filter((v) => v.status === 'signed').length;
}

function getIsmTypeName(type: IsmType): string {
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
    [IsmType.ARB_L2_TO_L1]: 'Arb L2→L1',
    [IsmType.OFFCHAIN_LOOKUP]: 'Offchain Lookup',
  };
  return typeNames[type] || type;
}

function getTypeBadgeColor(type: IsmType): string {
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
 * Returns the first multisig validator list found, along with its threshold.
 */
export function extractValidatorInfo(result: MetadataBuildResult | null | undefined): {
  validators: ValidatorInfo[];
  threshold: number;
} | null {
  if (!result) return null;

  // Check if this is a multisig result
  if (isMultisigResult(result)) {
    const multisigResult = result as MultisigMetadataBuildResult;
    if (multisigResult.validators && multisigResult.validators.length > 0) {
      return {
        validators: multisigResult.validators,
        threshold: multisigResult.threshold,
      };
    }
  }

  // Check aggregation sub-modules
  if (isAggregationResult(result)) {
    const aggResult = result as AggregationMetadataBuildResult;
    if (aggResult.modules) {
      for (const subModule of aggResult.modules) {
        const info = extractValidatorInfo(subModule);
        if (info) return info;
      }
    }
  }

  // Check routing selected ISM
  if (isRoutingResult(result)) {
    const routingResult = result as RoutingMetadataBuildResult;
    if (routingResult.selectedIsm) {
      return extractValidatorInfo(routingResult.selectedIsm);
    }
  }

  return null;
}
