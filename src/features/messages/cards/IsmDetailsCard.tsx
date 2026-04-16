import type {
  AggregationMetadataBuildResult,
  MetadataBuildResult,
  MultisigMetadataBuildResult,
  RoutingMetadataBuildResult,
  ValidatorInfo,
} from '@hyperlane-xyz/sdk';
import { shortenAddress } from '@hyperlane-xyz/utils';
import { Tooltip } from '@hyperlane-xyz/widgets';
import { useState } from 'react';

import { SectionCard } from '../../../components/layout/SectionCard';
import { docLinks } from '../../../consts/links';
import {
  getIsmTypeName,
  getSignedCount,
  getTypeBadgeColor,
  isAggregationResult,
  isMultisigResult,
  isRoutingResult,
} from './ismHelpers';

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
  const isExpandable = isAggregation || isRouting || isMultisig;

  const typeName = getIsmTypeName(result.type);
  const badgeColor = getTypeBadgeColor(result.type);

  return (
    <div className={`${depth > 0 ? 'ml-4 border-l-2 border-gray-200 pl-3' : ''}`}>
      <div
        className={`flex items-center space-x-2 py-1 ${isExpandable ? 'cursor-pointer' : ''}`}
        onClick={() => isExpandable && setExpanded(!expanded)}
      >
        {/* Expand/collapse indicator */}
        {isExpandable && <span className="w-3 text-xs text-gray-400">{expanded ? '▼' : '▶'}</span>}

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
            hasQuorum ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'
          }`}
        >
          {signedCount}/{validators.length} ({threshold} required)
        </span>
      </div>

      {/* Validator rows */}
      <div className="max-h-40 space-y-1 overflow-y-auto">
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
