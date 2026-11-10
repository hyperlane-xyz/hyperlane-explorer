import { BoxArrowIcon, CopyButton, SpinnerIcon } from '@hyperlane-xyz/widgets';
import clsx from 'clsx';
import { useMemo, type ReactNode } from 'react';

import { CheckmarkIcon } from '../../../components/icons/CheckmarkIcon';
import { LockIcon } from '../../../components/icons/LockIcon';
import { PersonIcon } from '../../../components/icons/PersonIcon';
import { useChainMetadata } from '../../../metadataStore';
import { logger } from '../../../utils/logger';
import { truncateString } from '../../../utils/string';
import { useMessageDiagnosticsContext } from '../diagnostics/MessageDiagnosticsContext';
import { hasPassedValidation } from '../diagnostics/timeline';
import {
  DiagnosticModule,
  DiagnosticState,
  diagnosticLabel,
  diagnosticModuleStatus,
  isOffchainAttestationPending,
  isWaitingForCommit,
  isWaitingForOffchainAttestation,
  offchainReadLabel,
} from '../diagnostics/types';
import { getValidatorSignatures, signatureLocationUrl } from '../diagnostics/validatorSignatures';
import { postgresByteaToAddress } from '../queries/encoding';
import { AddressInline } from './ismRender/AddressInline';

import styles from './MessageDiagnosticsCard.module.css';

interface Props {
  originDomainId: number;
  destinationChainName: string;
  delivered: boolean;
}

export function MessageDiagnosticsCard({ originDomainId, destinationChainName, delivered }: Props) {
  const { diagnostics, observation, connectionState, fetching, error } =
    useMessageDiagnosticsContext();
  const state = observation?.state;
  const waitingForCommit = isWaitingForCommit(state);
  const waitingForAttestation = isWaitingForOffchainAttestation(state);
  const proofReady = hasPassedValidation(state);
  const live = connectionState === 'live' && !delivered;
  const failed = !!state?.failure && !waitingForCommit && !waitingForAttestation && !delivered;

  const summary = delivered
    ? 'Accepted on destination'
    : proofReady
      ? 'Validation ready'
      : waitingForAttestation
        ? 'Attestation pending'
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
    <section
      className="shadow-card min-w-0 overflow-hidden rounded-xl border border-gray-200 bg-white"
      aria-label="Message security"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-gray-150 px-4 py-3">
        <div className="flex items-center gap-2">
          <LockIcon width={16} height={16} className="text-primary-700" aria-hidden="true" />
          <h2 className="text-sm font-medium text-gray-800">Message security</h2>
        </div>
        <p
          className={clsx(
            'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xxs font-medium',
            delivered || proofReady
              ? 'border-green-200/60 bg-green-25/50 text-green-700'
              : live &&
                  !failed &&
                  (waitingForAttestation ||
                    ['preparing', 'awaiting_signatures'].includes(state?.phase ?? ''))
                ? 'border-primary-100 bg-accent-25 text-primary-700'
                : 'border-gray-200 bg-gray-100 text-gray-500',
          )}
        >
          {(delivered || proofReady) && (
            <span aria-hidden="true">
              <CheckmarkIcon width={13} height={13} color="currentColor" />
            </span>
          )}
          {summary}
        </p>
      </header>
      <div className="p-4">
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
                style={{ color: 'inherit' }}
                className="shrink-0 motion-reduce:animate-none"
              />
            )}
            <span>
              {fetching
                ? 'Loading validation details…'
                : error
                  ? 'Validation details are temporarily unavailable.'
                  : delivered
                    ? 'No relayer diagnostics were recorded for this message.'
                    : 'Waiting for a relayer observation.'}
            </span>
          </div>
        ) : (
          <>
            <IsmTree
              key={observation.relayer}
              state={state}
              chainName={destinationChainName}
              originDomainId={originDomainId}
              active={
                live &&
                !failed &&
                !waitingForCommit &&
                (waitingForAttestation ||
                  ['preparing', 'awaiting_signatures'].includes(state.phase ?? ''))
              }
            />
            {(state.retry?.reason || state.failure?.reason) && (
              <details className="mt-3 text-xs text-gray-500">
                <summary className="cursor-pointer py-1">
                  {waitingForCommit ? 'Waiting for commit confirmation' : 'Relay notes'}
                </summary>
                <div className="mt-1 space-y-1 border-l border-gray-200 pl-3 leading-relaxed">
                  {state.retry?.reason && (
                    <p>
                      {waitingForAttestation
                        ? 'The attestation service has not produced the proof yet. The relayer will retry automatically.'
                        : diagnosticLabel(state.retry.reason)}
                    </p>
                  )}
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
  originDomainId,
  active,
}: {
  state: DiagnosticState;
  chainName: string;
  originDomainId: number;
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
    <ul aria-label="ISM validation tree" className="space-y-1.5">
      {roots.map((nodeId) => (
        <IsmTreeNode
          key={nodeId}
          nodeId={nodeId}
          modules={modules}
          chainName={chainName}
          originDomainId={originDomainId}
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
  originDomainId,
  selected,
  preparing,
  active,
  ancestors,
}: {
  nodeId: string;
  modules: Map<string, DiagnosticModule>;
  chainName: string;
  originDomainId: number;
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
  const attestationPending = isOffchainAttestationPending(node);
  const unused = status === 'unused';
  const complete = status === 'verified' || status === 'ready';
  const working = active && status === 'waiting' && selected !== false;
  const aggregation = node.module_type === 'Aggregation';
  const hasSignatures = !!(
    node.module_type?.endsWith('Multisig') ||
    node.validators ||
    node.signatures
  );
  const signatureThreshold = node.signatures?.threshold ?? node.threshold;
  const requiredCaption =
    aggregation && node.threshold != null
      ? `${node.threshold}${node.children.length ? ` of ${node.children.length}` : ''} checks required`
      : hasSignatures && signatureThreshold != null
        ? `${signatureThreshold}${node.validators?.length ? ` of ${node.validators.length}` : ''} signatures required`
        : undefined;
  const collected = node.signatures?.signers.length;
  const caption =
    node.module_type === 'Routing' && originDomainId >= 0
      ? `Origin domain ${originDomainId}`
      : requiredCaption;
  const moduleLabel =
    node.module_type === 'Null'
      ? 'Null ISM'
      : diagnosticLabel(node.module_type ?? 'Security module');
  const statusLabel = unused
    ? 'Unused'
    : complete && aggregation && node.verified != null && node.threshold != null
      ? `${Math.min(node.verified, node.threshold)}/${node.threshold} checks passed`
      : complete && hasSignatures && collected != null && signatureThreshold != null
        ? `${Math.min(collected, signatureThreshold)}/${signatureThreshold} signatures collected`
        : status === 'verified'
          ? 'Check passed'
          : status === 'ready'
            ? 'Proof ready'
            : status === 'failed'
              ? 'Attempt failed'
              : status === 'unknown'
                ? 'Not explored'
                : attestationPending
                  ? 'Attestation pending'
                  : working
                    ? 'Checking'
                    : 'Waiting';
  const checks = node.checks && typeof node.checks === 'object' ? Object.entries(node.checks) : [];

  return (
    <li
      data-node-id={nodeId}
      data-state={status}
      className={clsx('min-w-0', ancestors.length > 0 && styles.branch)}
    >
      <details className="peer group/node overflow-hidden rounded-xl border border-gray-200 bg-white open:shadow-sm">
        <summary
          className={clsx(
            'grid cursor-pointer list-none grid-cols-[1.5rem_minmax(0,1fr)_0.5rem] items-center gap-x-2 gap-y-1 px-3 py-2.5 text-xs transition-colors hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-green-500 group-open/node:bg-gray-50 motion-reduce:transition-none sm:flex sm:gap-2 [&::-webkit-details-marker]:hidden',
            (working || unused) && 'bg-gray-50',
          )}
        >
          <span
            className={clsx(
              'row-span-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors motion-reduce:transition-none',
              unused || status === 'unknown'
                ? 'border-gray-200 bg-gray-100 text-gray-400'
                : status === 'failed'
                  ? 'border-red-100 bg-red-100/20 text-red-700'
                  : complete
                    ? 'border-green-200/60 bg-green-25/60 text-green-600'
                    : working
                      ? 'border-gray-200 bg-white text-gray-600'
                      : 'border-gray-200 bg-white text-gray-400',
            )}
            aria-hidden="true"
          >
            {complete ? (
              <span className={styles.check}>
                <CheckmarkIcon width={15} height={15} color="currentColor" />
              </span>
            ) : status === 'failed' ? (
              '×'
            ) : working ? (
              <SpinnerIcon
                width={12}
                height={12}
                color="currentColor"
                style={{ color: 'inherit' }}
                className="motion-reduce:animate-none"
              />
            ) : unused ? (
              '−'
            ) : (
              '○'
            )}
          </span>
          <span className={clsx('min-w-0 flex-1', unused ? 'text-gray-500' : 'text-gray-800')}>
            <span className="block font-medium sm:truncate" title={moduleLabel}>
              {moduleLabel}
            </span>
            {caption && <span className="mt-0.5 block text-xxs text-gray-500">{caption}</span>}
          </span>
          <span
            className={clsx(
              'col-start-2 row-start-2 shrink-0 justify-self-start rounded-full border px-2 py-0.5 text-right text-xxs transition-colors motion-reduce:transition-none',
              unused
                ? 'border-transparent text-gray-500'
                : status === 'failed'
                  ? 'border-red-100 bg-red-100/20 text-red-700'
                  : complete
                    ? 'border-green-100/60 bg-green-25/40 text-green-600'
                    : working
                      ? 'border-gray-200 bg-gray-100 text-gray-600'
                      : 'border-gray-200 bg-gray-100 text-gray-500',
            )}
          >
            <span className="block">{statusLabel}</span>
          </span>
          <span
            className="col-start-3 row-span-2 row-start-1 text-gray-400 transition-transform group-open/node:rotate-90 motion-reduce:transition-none"
            aria-hidden="true"
          >
            ›
          </span>
        </summary>
        <div className="space-y-3 border-t border-gray-200 px-3 py-3 text-xs leading-relaxed text-gray-600 sm:px-4">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <span className="text-xxs font-medium text-gray-500">ISM program</span>
            <ProgramAddress address={node.ism} chainName={chainName} />
          </div>
          {!complete && aggregation && node.verified != null && node.threshold != null && (
            <p>
              {node.verified}/{node.threshold} required checks passed
            </p>
          )}
          <IsmProofDetails node={node} muted={unused} failed={status === 'failed'} />
          {hasSignatures && <ValidatorSignatures node={node} muted={unused} />}
          {node.metadata_status && node.metadata_status !== 'ready' && (
            <p>
              {attestationPending
                ? 'Proof generation will resume automatically.'
                : `Proof data: ${diagnosticLabel(node.metadata_status)}`}
            </p>
          )}
          {checks.map(
            ([name, result]) =>
              typeof result === 'string' && (
                <p
                  key={name}
                  className={clsx(
                    !unused && result === 'succeeded' && 'text-green-700',
                    status === 'failed' && result === 'failed' && 'text-red-700',
                  )}
                >
                  {diagnosticLabel(name)}: {diagnosticLabel(result)}
                </p>
              ),
          )}
          {node.metadata_error &&
            !(attestationPending && node.metadata_error === 'Could not fetch metadata') && (
              <p className={clsx(status === 'failed' && 'text-red-700')}>{node.metadata_error}</p>
            )}
          {unused && <p>This alternative is not required by the selected path.</p>}
        </div>
      </details>
      {node.children.length > 0 && (
        <ul
          className={clsx(
            'ml-3 mt-1 space-y-1 border-l border-gray-200 pl-2 sm:ml-5 sm:pl-3',
            unused && 'hidden peer-open:block',
          )}
        >
          {node.children.map((child) => (
            <IsmTreeNode
              key={child.node_id}
              nodeId={child.node_id}
              modules={modules}
              chainName={chainName}
              originDomainId={originDomainId}
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

function IsmProofDetails({
  node: { signatures, merkle_leaf: leaf, offchain_read: gateway, verification },
  muted,
  failed,
}: {
  node: DiagnosticModule;
  muted: boolean;
  failed: boolean;
}) {
  if (signatures?.index == null && !signatures?.root && !leaf && !gateway && !verification)
    return null;
  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-3">
      <ProofField label="Checkpoint index">{signatures?.index}</ProofField>
      {signatures?.root && (
        <ProofField label="Checkpoint root" className="flex items-start gap-2">
          <code className="min-w-0 break-all text-xxs">{signatures.root}</code>
          <CopyButton
            copyValue={signatures.root}
            width={12}
            height={12}
            aria-label="Copy checkpoint root"
            className="mt-0.5 shrink-0 opacity-60"
          />
        </ProofField>
      )}
      <ProofField label="Message leaf index">{leaf?.index}</ProofField>
      <ProofField label="Latest known leaf">{leaf?.highest_known}</ProofField>
      {gateway && (
        <>
          <ProofField
            label="Gateway response"
            className={clsx(
              !muted && gateway.state === 'succeeded' && 'text-green-600',
              failed && gateway.state !== 'succeeded' && 'text-red-700',
            )}
          >
            {gateway.state === 'succeeded'
              ? 'Proof data received and decoded'
              : offchainReadLabel(gateway.state)}
          </ProofField>
          <ProofField label="HTTP status">{gateway.http_status}</ProofField>
          <ProofField label="Gateway">
            {gateway.endpoint != null ? `Endpoint ${gateway.endpoint + 1}` : undefined}
          </ProofField>
        </>
      )}
      <ProofField
        label="Verification dry run"
        className={clsx(
          !muted && verification === 'succeeded' && 'text-green-600',
          failed && verification === 'failed' && 'text-red-700',
        )}
      >
        {verification ? diagnosticLabel(verification) : undefined}
      </ProofField>
    </dl>
  );
}

function ProofField({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  if (children == null) return null;
  return (
    <>
      <dt className="text-gray-500">{label}</dt>
      <dd className={clsx('min-w-0 font-mono', className)}>{children}</dd>
    </>
  );
}

function ValidatorSignatures({ node, muted }: { node: DiagnosticModule; muted: boolean }) {
  const validators = getValidatorSignatures(node);
  const hasLatestIndices = validators.some(({ latestIndex }) => latestIndex != null);
  const hasUnknownSignatures = validators.some(({ status }) => status === 'unknown');
  const columns = hasLatestIndices
    ? 'sm:grid-cols-[minmax(0,1fr)_8rem_9rem]'
    : 'sm:grid-cols-[minmax(0,1fr)_9rem]';
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div
        className={clsx(
          'grid items-center gap-3 border-b border-gray-200 bg-gray-50 px-3 py-2 text-xxs text-gray-500',
          columns,
        )}
      >
        <h3 className="flex items-center gap-2 font-medium text-gray-700">
          <PersonIcon width={15} height={15} aria-hidden="true" />
          Validators
        </h3>
        {hasLatestIndices && <span className="hidden text-right sm:block">Latest checkpoint</span>}
        <span className="hidden text-right sm:block">Signature</span>
      </div>
      {!validators.length ? (
        <p className="px-3 py-3 text-gray-500">Validator addresses are not recorded.</p>
      ) : (
        <ul className="divide-y divide-gray-200/70" aria-label="Validator signatures">
          {validators.map(({ address, status, location, reason, latestIndex }) => {
            const locationUrl = signatureLocationUrl(location);
            return (
              <li
                key={address}
                data-validator-status={status}
                className={clsx(
                  'grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-3 py-1.5 transition-colors even:bg-gray-50/60 hover:bg-gray-100/70',
                  columns,
                )}
              >
                <div className="col-span-2 flex min-w-0 items-center gap-2 sm:col-span-1">
                  <span
                    aria-hidden="true"
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-gray-100 text-gray-500"
                  >
                    <PersonIcon width={14} height={14} />
                  </span>
                  <span title={address} className="truncate font-mono text-xs text-gray-700">
                    {truncateString(address, 8, 6)}
                  </span>
                  <CopyButton
                    copyValue={address}
                    width={12}
                    height={12}
                    aria-label="Copy validator address"
                    className="shrink-0 text-gray-500 opacity-60 [&_rect]:stroke-current [&_path]:fill-current"
                  />
                </div>
                {hasLatestIndices && (
                  <div className="flex items-center gap-1.5 text-xxs sm:justify-end">
                    <span className="text-gray-500 sm:sr-only">Latest checkpoint</span>
                    <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 font-mono text-gray-700">
                      {latestIndex ?? '—'}
                    </span>
                  </div>
                )}
                <span
                  className={clsx(
                    'justify-self-end rounded-full border px-2 py-0.5 text-xxs font-medium',
                    !hasLatestIndices && 'col-span-2 sm:col-span-1',
                    !muted && status === 'collected'
                      ? 'border-green-100/70 bg-green-25/60 text-green-600'
                      : 'border-gray-200 bg-gray-100/70 text-gray-500',
                  )}
                  title={reason}
                >
                  {locationUrl ? (
                    <a
                      href={locationUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Open signature location for ${address}`}
                      title={location}
                      className="inline-flex items-center gap-1.5 leading-none transition-colors hover:text-green-800"
                    >
                      <span>✓ Observed</span>
                      <BoxArrowIcon width={11} height={11} aria-hidden="true" />
                    </a>
                  ) : (
                    <span>
                      {status === 'collected'
                        ? '✓ Observed'
                        : status === 'unavailable'
                          ? 'Unavailable'
                          : 'Not reported'}
                    </span>
                  )}
                </span>
                {reason && (
                  <p className="col-span-full pl-8 text-xxs leading-relaxed text-gray-500">
                    {reason}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {(hasLatestIndices || hasUnknownSignatures) && (
        <div className="space-y-0.5 border-t border-gray-200 bg-gray-50 px-3 py-1.5 text-xxs leading-relaxed text-gray-500">
          {hasLatestIndices && (
            <p>Checkpoint indices were observed by this relayer during proof collection.</p>
          )}
          {hasUnknownSignatures && (
            <p>“Not reported” means no signature was observed before collection stopped.</p>
          )}
        </div>
      )}
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
