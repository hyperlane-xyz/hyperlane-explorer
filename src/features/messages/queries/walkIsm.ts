import type { ChainMap, ChainMetadata } from '@hyperlane-xyz/sdk';
import { type DerivedIsmConfig, EvmIsmReader, IsmType, MultiProvider } from '@hyperlane-xyz/sdk';
import { createChainMetadataResolver } from '@hyperlane-xyz/sdk/metadata/ChainMetadataResolver';
import { ethers } from 'ethers';

import { logger } from '../../../utils/logger';
import { getChainDisplayName } from '../../chains/utils';
import { AbortError, wrapWithAbort } from './abortableProvider';

export interface IsmNode {
  address: string;
  typeLabel: string;
  ismType?: string;
  children?: IsmChild[];
  error?: string;
}

export interface IsmChild {
  label?: string;
  node: IsmNode;
}

const PER_NODE_TIMEOUT_MS = 20_000;
const CHILD_CONCURRENCY = 4;
const MAX_DEPTH = 6;

export class IsmWalkAbortError extends Error {
  constructor() {
    super('ISM walk aborted');
    this.name = 'IsmWalkAbortError';
  }
}

interface WalkContext {
  multiProvider: MultiProvider;
  chainMetadata: ChainMap<ChainMetadata>;
  chainName: string;
  signal?: AbortSignal;
}

const SHALLOW_TYPE = '__shallow__' as const;

/**
 * Subclasses EvmIsmReader to short-circuit recursive expansion.
 * `deriveIsmConfig(string)` is called by `deriveAggregationConfig` /
 * `deriveRoutingConfig` etc. to expand each child. By returning a placeholder
 * with just the address, we get the parent's full type label + child
 * addresses without the SDK trying to recursively derive (and potentially
 * fail) entire subtrees in one shot. We drive recursion ourselves with
 * per-branch try/catch.
 */
class ShallowEvmIsmReader extends EvmIsmReader {
  // SDK's deriveIsmConfig is overloaded; override single impl
  override async deriveIsmConfig(config: unknown): Promise<DerivedIsmConfig> {
    if (typeof config === 'string') {
      return {
        address: config,
        type: SHALLOW_TYPE as unknown as IsmType,
      } as unknown as DerivedIsmConfig;
    }
    return config as DerivedIsmConfig;
  }
}

function checkAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new IsmWalkAbortError();
}

const MODULE_TYPE_FALLBACK_LABELS: Record<number, string> = {
  0: 'Unused ISM',
  1: 'Routing ISM',
  2: 'Aggregation ISM',
  3: 'Legacy Multisig ISM',
  4: 'Merkle Root Multisig ISM',
  5: 'Message ID Multisig ISM',
  6: 'Null ISM',
  7: 'CCIP Read ISM',
  8: 'Arbitrum L2→L1 ISM',
  9: 'Weighted Merkle Root Multisig ISM',
  10: 'Weighted Message ID Multisig ISM',
};

const ISM_MODULE_TYPE_ABI = ['function moduleType() view returns (uint8)'];

const ISM_TYPE_LABELS: Record<string, string> = {
  [IsmType.CUSTOM]: 'Custom ISM',
  [IsmType.OP_STACK]: 'OP Stack ISM',
  [IsmType.ROUTING]: 'Routing ISM',
  [IsmType.INCREMENTAL_ROUTING]: 'Incremental Routing ISM',
  [IsmType.FALLBACK_ROUTING]: 'Fallback Routing ISM',
  [IsmType.AMOUNT_ROUTING]: 'Amount Routing ISM',
  [IsmType.INTERCHAIN_ACCOUNT_ROUTING]: 'ICA Routing ISM',
  [IsmType.AGGREGATION]: 'Aggregation ISM',
  [IsmType.STORAGE_AGGREGATION]: 'Storage Aggregation ISM',
  [IsmType.MERKLE_ROOT_MULTISIG]: 'Merkle Root Multisig ISM',
  [IsmType.MESSAGE_ID_MULTISIG]: 'Message ID Multisig ISM',
  [IsmType.STORAGE_MERKLE_ROOT_MULTISIG]: 'Storage Merkle Root Multisig ISM',
  [IsmType.STORAGE_MESSAGE_ID_MULTISIG]: 'Storage Message ID Multisig ISM',
  [IsmType.WEIGHTED_MERKLE_ROOT_MULTISIG]: 'Weighted Merkle Root Multisig ISM',
  [IsmType.WEIGHTED_MESSAGE_ID_MULTISIG]: 'Weighted Message ID Multisig ISM',
  [IsmType.TEST_ISM]: 'Test ISM',
  [IsmType.PAUSABLE]: 'Pausable ISM',
  [IsmType.TRUSTED_RELAYER]: 'Trusted Relayer ISM',
  [IsmType.ARB_L2_TO_L1]: 'Arbitrum L2→L1 ISM',
  [IsmType.CCIP]: 'CCIP ISM',
  [IsmType.OFFCHAIN_LOOKUP]: 'Offchain Lookup ISM',
  [IsmType.UNKNOWN]: 'Unknown ISM',
};

function labelFor(type: string): string {
  return ISM_TYPE_LABELS[type] ?? type;
}

export async function walkIsm(ctx: WalkContext, address: string, depth = 0): Promise<IsmNode> {
  checkAborted(ctx.signal);
  if (depth > MAX_DEPTH) {
    logger.warn(`ISM walk hit max depth (${MAX_DEPTH}) at ${address} on ${ctx.chainName}`);
    return { address, typeLabel: 'Unknown', error: 'Max recursion depth' };
  }

  // Per-call abort controller. Aborts on parent abort OR per-call timeout.
  // Critical: the wrapped provider for THIS call watches this signal, so when
  // the timeout fires the underlying SmartProvider retry/fallback short-circuits
  // — no zombie network requests after timeout.
  const callCtrl = new AbortController();
  if (ctx.signal?.aborted) callCtrl.abort();
  const onParentAbort = () => callCtrl.abort();
  ctx.signal?.addEventListener('abort', onParentAbort);
  const callTimer = setTimeout(() => callCtrl.abort(), PER_NODE_TIMEOUT_MS);

  try {
    const baseProvider = ctx.multiProvider.getProvider(ctx.chainName);
    const callProvider = wrapWithAbort(baseProvider, callCtrl.signal);

    // Read moduleType first so we always have at least a coarse type label
    // even if the deeper SDK derivation fails / times out. A flaky moduleType
    // probe shouldn't kill the branch — stash the error and still try the
    // deeper derive, only fall back to "Unknown" if that also fails.
    let coarseLabel = 'Unknown';
    let coarseError: string | undefined;
    try {
      const ism = new ethers.Contract(address, ISM_MODULE_TYPE_ABI, callProvider);
      const moduleType: number = await ism.moduleType();
      coarseLabel = MODULE_TYPE_FALLBACK_LABELS[moduleType] ?? `Type ${moduleType}`;
    } catch (e) {
      if (e instanceof AbortError || e instanceof IsmWalkAbortError) throw e;
      coarseError = e instanceof Error ? e.message : String(e);
    }

    checkAborted(ctx.signal);

    // Build a per-call MultiProvider that wraps THIS call's provider with the
    // call-scoped abort signal. The SDK reader uses it; when the per-call
    // timeout fires, all in-flight + pending RPCs for this call short-circuit.
    const callMP = new MultiProvider(ctx.chainMetadata, {
      providers: { [ctx.chainName]: callProvider },
    });
    const reader = new ShallowEvmIsmReader(callMP, ctx.chainName);

    let cfg: DerivedIsmConfig | undefined;
    let deriveError: string | undefined;
    try {
      cfg = await reader.deriveIsmConfigFromAddress(address);
    } catch (e) {
      // Real aborts (parent navigation / side timeout / per-call timeout
      // routed through wrapWithAbort) must propagate, not get folded into a
      // per-node error — otherwise the walk completes with all-error nodes
      // instead of cancelling cleanly.
      if (e instanceof AbortError || e instanceof IsmWalkAbortError) throw e;
      // Distinguish per-call timeout from other failures
      if (callCtrl.signal.aborted && !ctx.signal?.aborted) {
        deriveError = `Timed out (${PER_NODE_TIMEOUT_MS}ms)`;
      } else {
        deriveError = e instanceof Error ? e.message : String(e);
      }
    }

    checkAborted(ctx.signal);

    if (!cfg) {
      return {
        address,
        typeLabel: coarseLabel,
        error: deriveError ?? coarseError,
      };
    }

    const node: IsmNode = {
      address: cfg.address ?? address,
      typeLabel: labelFor(cfg.type as string),
      ismType: cfg.type as string,
    };

    const childAddrs = extractChildAddresses(cfg, ctx.chainMetadata);
    if (childAddrs.length > 0) {
      node.children = await walkChildrenInParallel(ctx, childAddrs, depth);
    }

    return node;
  } finally {
    clearTimeout(callTimer);
    ctx.signal?.removeEventListener('abort', onParentAbort);
  }
}

function extractChildAddresses(
  cfg: DerivedIsmConfig,
  chainMetadata: ChainMap<ChainMetadata>,
): Array<{ label?: string; address: string }> {
  const out: Array<{ label?: string; address: string }> = [];
  const type = cfg.type as string;
  const resolver = createChainMetadataResolver(chainMetadata);
  const display = (chainName: string) => getChainDisplayName(resolver, chainName);

  if (type === IsmType.AGGREGATION || type === IsmType.STORAGE_AGGREGATION) {
    const modules = (cfg as unknown as { modules: Array<{ address: string }> }).modules ?? [];
    for (const m of modules) {
      if (m?.address) out.push({ address: m.address });
    }
  } else if (
    type === IsmType.ROUTING ||
    type === IsmType.FALLBACK_ROUTING ||
    type === IsmType.INCREMENTAL_ROUTING
  ) {
    const domains =
      (cfg as unknown as { domains: Record<string, { address: string }> }).domains ?? {};
    for (const [chainName, child] of Object.entries(domains)) {
      if (child?.address) out.push({ label: display(chainName), address: child.address });
    }
  } else if (type === IsmType.AMOUNT_ROUTING) {
    const lower = (cfg as unknown as { lowerIsm?: { address: string } }).lowerIsm;
    const upper = (cfg as unknown as { upperIsm?: { address: string } }).upperIsm;
    if (lower?.address) out.push({ label: 'lower', address: lower.address });
    if (upper?.address) out.push({ label: 'upper', address: upper.address });
  } else if (type === IsmType.INTERCHAIN_ACCOUNT_ROUTING) {
    const isms = (cfg as unknown as { isms?: Record<string, string> }).isms ?? {};
    for (const [chainName, addr] of Object.entries(isms)) {
      if (addr && addr !== ethers.constants.AddressZero) {
        out.push({ label: display(chainName), address: addr });
      }
    }
  }

  return out;
}

async function walkChildrenInParallel(
  ctx: WalkContext,
  entries: Array<{ label?: string; address: string }>,
  depth: number,
): Promise<IsmChild[]> {
  const out: IsmChild[] = new Array(entries.length);
  let cursor = 0;

  const workers: Promise<void>[] = [];
  for (let w = 0; w < Math.min(CHILD_CONCURRENCY, entries.length); w++) {
    workers.push(
      (async () => {
        while (true) {
          const i = cursor++;
          if (i >= entries.length) return;
          const entry = entries[i];
          checkAborted(ctx.signal);
          try {
            const node = await walkIsm(ctx, entry.address, depth + 1);
            out[i] = { label: entry.label, node };
          } catch (e) {
            if (e instanceof IsmWalkAbortError) throw e;
            out[i] = {
              label: entry.label,
              node: {
                address: entry.address,
                typeLabel: 'Unknown',
                error: 'Failed to walk child',
              },
            };
          }
        }
      })(),
    );
  }

  await Promise.all(workers);
  return out;
}
