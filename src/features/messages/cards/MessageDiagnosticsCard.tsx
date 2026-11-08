import { CopyButton, SpinnerIcon } from '@hyperlane-xyz/widgets';
import clsx from 'clsx';
import { useMemo } from 'react';

import { useChainMetadata } from '../../../metadataStore';
import { logger } from '../../../utils/logger';
import { truncateString } from '../../../utils/string';
import { useMessageDiagnosticsContext } from '../diagnostics/MessageDiagnosticsContext';
import {
  DiagnosticModule,
  DiagnosticState,
  diagnosticLabel,
  diagnosticModuleStatus,
  isWaitingForCommit,
} from '../diagnostics/types';
import { getValidatorSignatures } from '../diagnostics/validatorSignatures';
import { postgresByteaToAddress } from '../queries/encoding';
import { AddressInline } from './ismRender/AddressInline';

interface Props {
  destinationChainName: string;
  delivered: boolean;
}

export function MessageDiagnosticsCard({ destinationChainName, delivered }: Props) {
  const { diagnostics, observation, connectionState, fetching, error } =
    useMessageDiagnosticsContext();
  const state = observation?.state;
  const waitingForCommit = isWaitingForCommit(state);
  const proofReady =
    !!state &&
    ['ready_to_submit', 'submitting', 'confirming', 'delivered'].includes(state.phase ?? '');
  const live = connectionState === 'live' && !delivered;
  const failed = !!state?.failure && !waitingForCommit && !delivered;

  const summary = delivered
    ? 'Accepted on destination'
    : proofReady
      ? 'Validation ready'
      : waitingForCommit || failed || state?.phase === 'retrying'
        ? 'Waiting for validation'
        : state
          ? live && ['preparing', 'awaiting_signatures'].includes(state.phase ?? '')
            ? 'Checks in progress'
            : 'Last reported checks'
          : fetching
            ? 'Loading validation details'
            : error
              ? 'Validation details unavailable'
              : 'Waiting for relayer checks';

  return (
    <section className="min-w-0" aria-label="Security validation">
      <div className="space-y-1">
        <h2 className="text-sm font-medium text-gray-900">Security validation</h2>
        <p
          className={clsx(
            'text-xs',
            delivered ? 'text-green-700' : proofReady ? 'text-primary-700' : 'text-gray-500',
          )}
        >
          {summary}
        </p>
      </div>
      <div className="mt-3">
        <p className="mb-3 text-xs leading-relaxed text-gray-500">
          The selected checks authorize this message. Unused alternatives do not block delivery.
        </p>
        {!state ? (
          <div className="flex items-center gap-2 py-2 text-sm text-gray-500">
            {fetching && (
              <SpinnerIcon
                width={14}
                height={14}
                color="currentColor"
                className="shrink-0 motion-reduce:animate-none"
              />
            )}
            <span>
              {fetching
                ? 'Loading validation details…'
                : error
                  ? 'Validation details are temporarily unavailable.'
                  : delivered
                    ? 'No validation details were recorded for this message.'
                    : 'Waiting for a relayer observation.'}
            </span>
          </div>
        ) : (
          <>
            <IsmTree
              key={observation.relayer}
              state={state}
              chainName={destinationChainName}
              active={live && !failed}
            />
            {(state.retry?.reason || state.failure?.reason) && (
              <details className="mt-3 text-xs text-gray-500">
                <summary className="cursor-pointer py-1">
                  {waitingForCommit ? 'Waiting for commit confirmation' : 'Relay notes'}
                </summary>
                <div className="mt-1 space-y-1 border-l border-gray-200 pl-3 leading-relaxed">
                  {state.retry?.reason && <p>{diagnosticLabel(state.retry.reason)}</p>}
                  {state.failure?.reason && (
                    <p className={clsx(failed && 'text-red-700')}>
                      {state.failure.stage && `${diagnosticLabel(state.failure.stage)}: `}
                      {diagnosticLabel(state.failure.reason)}
                    </p>
                  )}
                </div>
              </details>
            )}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-gray-200 pt-2 text-xxs text-gray-500">
              <span title={observation.relayer}>
                Relayer {truncateString(observation.relayer, 8, 6)}
              </span>
              <span>
                {diagnostics?.partial
                  ? 'Some details are unavailable'
                  : error || connectionState === 'disconnected'
                    ? 'Showing last observation'
                    : delivered || connectionState === 'historical'
                      ? 'Recorded validation path'
                      : live
                        ? 'Updating live'
                        : 'Connecting…'}
              </span>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function IsmTree({
  state,
  chainName,
  active,
}: {
  state: DiagnosticState;
  chainName: string;
  active: boolean;
}) {
  const modules = new Map(state.modules.map((module) => [module.node_id, module]));
  const childIds = new Set(
    state.modules.flatMap((module) => module.children.map((c) => c.node_id)),
  );
  const roots = state.tree_root
    ? [state.tree_root]
    : [...modules.keys()].filter((id) => !childIds.has(id));

  if (!roots.length) {
    return <p className="py-2 text-sm text-gray-500">Waiting for the security policy.</p>;
  }

  return (
    <ul
      aria-label="ISM validation tree"
      className="space-y-1 rounded-lg border border-gray-200 p-2"
    >
      {roots.map((nodeId) => (
        <IsmTreeNode
          key={nodeId}
          nodeId={nodeId}
          modules={modules}
          chainName={chainName}
          active={active}
          preparing={['preparing', 'awaiting_signatures'].includes(state.phase ?? '')}
          selected={true}
          ancestors={[]}
        />
      ))}
    </ul>
  );
}

function IsmTreeNode({
  nodeId,
  modules,
  chainName,
  selected,
  preparing,
  active,
  ancestors,
}: {
  nodeId: string;
  modules: Map<string, DiagnosticModule>;
  chainName: string;
  selected?: boolean;
  preparing: boolean;
  active: boolean;
  ancestors: string[];
}) {
  const node = modules.get(nodeId);
  if (!node || ancestors.includes(nodeId) || ancestors.length >= 16) {
    return (
      <li className="px-2 py-2 text-xs text-gray-500">
        {!node ? 'Waiting for module details' : 'Further branch details unavailable'}
      </li>
    );
  }
  const status = diagnosticModuleStatus(node, selected, preparing);
  const unused = status === 'unused';
  const complete = status === 'verified' || status === 'ready';
  const working = active && status === 'waiting' && selected !== false;
  const aggregation = node.module_type === 'Aggregation';
  const thresholdMet =
    node.threshold != null && node.verified != null && node.verified >= node.threshold;
  const moduleLabel =
    node.module_type === 'Null'
      ? 'Null ISM'
      : diagnosticLabel(node.module_type ?? 'Security module');
  const statusLabel = unused
    ? 'Unused'
    : thresholdMet && complete
      ? 'Threshold met'
      : status === 'verified'
        ? 'Check passed'
        : status === 'ready'
          ? 'Proof ready'
          : status === 'failed'
            ? 'Attempt failed'
            : status === 'unknown'
              ? 'Not explored'
              : working
                ? 'Checking'
                : 'Waiting';
  const checks = node.checks && typeof node.checks === 'object' ? Object.entries(node.checks) : [];

  return (
    <li data-node-id={nodeId} data-state={status} className="min-w-0">
      <details className="peer group/node rounded-md open:bg-gray-50/80">
        <summary className="flex cursor-pointer list-none items-center gap-2 rounded-md px-2 py-2 text-xs transition-colors hover:bg-gray-100/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500 [&::-webkit-details-marker]:hidden">
          <span
            className={clsx(
              'flex h-4 w-4 shrink-0 items-center justify-center',
              unused || status === 'unknown'
                ? 'text-gray-400'
                : status === 'failed'
                  ? 'text-red-700'
                  : 'text-primary-700',
            )}
            aria-hidden="true"
          >
            {complete ? (
              '✓'
            ) : status === 'failed' ? (
              '×'
            ) : working ? (
              <SpinnerIcon
                width={12}
                height={12}
                color="currentColor"
                className="motion-reduce:animate-none"
              />
            ) : unused ? (
              '−'
            ) : (
              '○'
            )}
          </span>
          <span className={clsx('min-w-0 flex-1', unused ? 'text-gray-500' : 'text-gray-800')}>
            <span className="block truncate font-medium" title={moduleLabel}>
              {moduleLabel}
            </span>
            {aggregation && node.threshold != null && (
              <span className="mt-0.5 block text-xxs text-gray-500">
                {node.threshold}
                {node.children.length > 0 && ` of ${node.children.length}`} checks required
              </span>
            )}
          </span>
          <span
            className={clsx(
              'shrink-0 text-right text-xxs',
              unused
                ? 'text-gray-500'
                : status === 'failed'
                  ? 'text-red-700'
                  : complete
                    ? 'text-primary-700'
                    : 'text-gray-500',
            )}
          >
            <span className="block">{statusLabel}</span>
          </span>
          <span
            className="text-gray-400 transition-transform group-open/node:rotate-90 motion-reduce:transition-none"
            aria-hidden="true"
          >
            ›
          </span>
        </summary>
        <div className="ml-4 space-y-2 border-l border-gray-200 px-3 pb-3 pt-1 text-xs leading-relaxed text-gray-600">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>Program</span>
            <ProgramAddress address={node.ism} chainName={chainName} />
          </div>
          {node.verified != null && node.threshold != null && (
            <p>
              {node.verified}/{node.threshold} required checks passed
              {thresholdMet ? ' · Threshold met' : ''}
            </p>
          )}
          {(node.module_type?.endsWith('Multisig') || node.validators || node.signatures) && (
            <ValidatorSignatures node={node} />
          )}
          {node.offchain_read && (
            <p className={clsx(node.offchain_read.state === 'succeeded' && 'text-primary-700')}>
              {node.offchain_read.state === 'succeeded'
                ? 'Gateway responded successfully'
                : `Gateway: ${diagnosticLabel(node.offchain_read.state)}`}
              {node.offchain_read.http_status != null &&
                ` · HTTP ${node.offchain_read.http_status}`}
            </p>
          )}
          {node.metadata_status && node.metadata_status !== 'ready' && (
            <p>Proof data: {diagnosticLabel(node.metadata_status)}</p>
          )}
          {node.metadata_status === 'ready' && (
            <p className="text-gray-500">
              Proof data is ready. Destination acceptance is tracked separately.
            </p>
          )}
          {checks.map(
            ([name, result]) =>
              typeof result === 'string' && (
                <p key={name}>
                  {diagnosticLabel(name)}: {diagnosticLabel(result)}
                </p>
              ),
          )}
          {node.metadata_error && (
            <p className={clsx(status === 'failed' && 'text-red-700')}>{node.metadata_error}</p>
          )}
          {unused && <p>This alternative is not required by the selected path.</p>}
        </div>
      </details>
      {node.children.length > 0 && (
        <ul
          className={clsx(
            'ml-3 space-y-1 border-l border-gray-200 pl-2 sm:ml-4',
            unused && 'hidden peer-open:block',
          )}
        >
          {node.children.map((child) => (
            <IsmTreeNode
              key={child.node_id}
              nodeId={child.node_id}
              modules={modules}
              chainName={chainName}
              active={active}
              preparing={preparing}
              selected={
                selected === false || node.selected_children?.includes(child.node_id) === false
                  ? false
                  : node.selected_children || (!aggregation && node.module_type !== 'Routing')
                    ? selected
                    : undefined
              }
              ancestors={[...ancestors, nodeId]}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function ValidatorSignatures({ node }: { node: DiagnosticModule }) {
  const validators = getValidatorSignatures(node);
  const threshold = node.signatures?.threshold ?? node.threshold;
  const total = node.validators?.length;
  const collected = node.signatures?.collected;
  return (
    <div>
      <p className="mb-1 font-medium">Validators</p>
      {(threshold != null || collected != null) && (
        <p className="mb-2 text-gray-600">
          {threshold != null && (
            <>
              {threshold}
              {total ? ` of ${total}` : ''} signatures required
            </>
          )}
          {threshold != null && collected != null && ' · '}
          {collected != null && `${collected} collected`}
        </p>
      )}
      {!validators.length && <p className="text-gray-500">Validator addresses are not recorded.</p>}
      {validators.some(({ status }) => status === 'unknown') && (
        <p className="mb-2 text-xxs text-gray-500">
          Unknown means individual signer details were not recorded, not that the validator did not
          sign.
        </p>
      )}
      <ul className="space-y-1" aria-label="Validator signatures">
        {validators.map(({ address, status, reason }) => (
          <li
            key={address}
            data-validator-status={status}
            className="flex min-w-0 items-center justify-between gap-2 rounded-md border border-gray-200 bg-gray-100/70 px-2 py-2 text-gray-500"
          >
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <span title={address} className="truncate font-mono text-xxs sm:text-xs">
                {truncateString(address, 8, 6)}
              </span>
              <CopyButton
                copyValue={address}
                width={12}
                height={12}
                className="shrink-0 opacity-60"
              />
            </span>
            <span
              className={clsx(
                'shrink-0 text-xxs font-medium',
                status === 'collected' ? 'text-primary-700' : 'text-gray-500',
              )}
              title={reason}
            >
              {status === 'collected'
                ? '✓ Signed'
                : status === 'unavailable'
                  ? 'Unavailable'
                  : 'Unknown'}
              {reason && <span className="sr-only">: {reason}</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ProgramAddress({ address, chainName }: { address: string; chainName: string }) {
  const metadata = useChainMetadata(chainName);
  const nativeAddress = useMemo(() => {
    if (!metadata || !/^0x[\da-fA-F]+$/.test(address)) return address;
    try {
      return postgresByteaToAddress(address, metadata);
    } catch (error) {
      logger.warn('Could not decode diagnostic module address', address, error);
      return undefined;
    }
  }, [address, metadata]);
  return nativeAddress ? (
    <AddressInline address={nativeAddress} chainName={chainName} />
  ) : (
    <code className="break-all text-xxs">{address}</code>
  );
}
