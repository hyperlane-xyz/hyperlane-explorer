import { ISafe__factory, Mailbox__factory, MailboxClient__factory } from '@hyperlane-xyz/core';
import type { ChainMap, ChainMetadata } from '@hyperlane-xyz/sdk';
import { MultiProvider } from '@hyperlane-xyz/sdk';
import { isZeroishAddress, ProtocolType, timeout } from '@hyperlane-xyz/utils';
import { ethers } from 'ethers';

import { AbortError, wrapWithAbort } from './abortableProvider';
import { walkIsm, IsmWalkAbortError, type IsmNode } from './walkIsm';

export type OwnerKind = 'eoa' | 'safe';
export type SafeInfo = { threshold: number; ownerCount: number };
export type IsmSource = 'token' | 'mailbox-default';

export interface WarpRouteIsmSide {
  chainName: string;
  tokenAddress: string;
  ismAddress: string;
  ismSource: IsmSource;
  ismTree: IsmNode | null;
  ismError?: string;
  owner: string;
  ownerKind: OwnerKind;
  safeInfo?: SafeInfo;
}

export interface WarpRouteIsmSideError {
  chainName: string;
  tokenAddress: string;
  error: string;
}

export type WarpRouteIsmSideResult =
  | { kind: 'data'; value: WarpRouteIsmSide }
  | { kind: 'unsupported'; chainName: string; protocol: string }
  | { kind: 'error'; value: WarpRouteIsmSideError };

export interface WarpRouteIsmResult {
  origin: WarpRouteIsmSideResult;
  destination: WarpRouteIsmSideResult;
}

export interface FetchWarpRouteIsmInput {
  chainMetadata: ChainMap<ChainMetadata>;
  providers: ChainMap<ethers.providers.Provider>;
  origin: { chainName: string; tokenAddress: string };
  destination: { chainName: string; tokenAddress: string };
  signal?: AbortSignal;
}

const SAFE_GET_OWNERS_ABI = ['function getOwners() view returns (address[])'];
const SIDE_TIMEOUT_MS = 60_000;
const PER_CALL_TIMEOUT_MS = 20_000;

function checkAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new AbortError();
}

export async function fetchWarpRouteIsm(
  input: FetchWarpRouteIsmInput,
): Promise<WarpRouteIsmResult> {
  const [origin, destination] = await Promise.all([
    runSideWithTimeout(input.chainMetadata, input.providers, input.origin, input.signal),
    runSideWithTimeout(input.chainMetadata, input.providers, input.destination, input.signal),
  ]);

  return { origin, destination };
}

async function runSideWithTimeout(
  chainMetadata: ChainMap<ChainMetadata>,
  rawProviders: ChainMap<ethers.providers.Provider>,
  side: { chainName: string; tokenAddress: string },
  parentSignal?: AbortSignal,
): Promise<WarpRouteIsmSideResult> {
  // Compose a side-scoped abort signal that fires when either:
  //  (a) the parent signal aborts (React Query unmount / navigation), or
  //  (b) the side-level timeout elapses.
  const ctrl = new AbortController();
  if (parentSignal?.aborted) ctrl.abort();
  const parentListener = () => ctrl.abort();
  parentSignal?.addEventListener('abort', parentListener);
  const timer = setTimeout(() => ctrl.abort(), SIDE_TIMEOUT_MS);

  // Wrap providers + build the SDK MultiProvider scoped to THIS side's signal.
  // Critical: doing the wrap here (not at the top of fetchWarpRouteIsm) means
  // the upfront router/mailbox/Safe reads AND the walker all see the side
  // timeout — without this, timeout fires the UI message but the underlying
  // SmartProvider retry chain keeps firing requests.
  const wrappedProviders: ChainMap<ethers.providers.Provider> = {};
  for (const [chain, provider] of Object.entries(rawProviders)) {
    wrappedProviders[chain] = wrapWithAbort(provider, ctrl.signal);
  }
  const sdkMultiProvider = new MultiProvider(chainMetadata, {
    providers: wrappedProviders,
  });

  const timeoutResult: WarpRouteIsmSideResult = {
    kind: 'error',
    value: {
      chainName: side.chainName,
      tokenAddress: side.tokenAddress,
      error: `Timed out after ${SIDE_TIMEOUT_MS / 1000}s`,
    },
  };

  // Race fetchSide against the side abort signal so the user-visible result
  // is bounded exactly by SIDE_TIMEOUT_MS.
  //
  // TODO: ethers v5's underlying `fetchJson` has its own uncancellable retry
  // loop (up to 12 attempts on HTTP 429), invisible to our abort proxy. After
  // the user-visible timeout fires, a tail of background RPC requests can
  // continue until those fetchJson loops exhaust. To fully kill the tail we'd
  // need to bypass the explorer's SmartProvider for this feature and build
  // our own provider chain with `throttleLimit: 1` on each connection (or
  // override `connection.fetchFunc` with an AbortSignal-aware fetch).
  const sideTimeoutPromise = new Promise<WarpRouteIsmSideResult>((resolve) => {
    if (ctrl.signal.aborted) {
      resolve(timeoutResult);
    } else {
      ctrl.signal.addEventListener('abort', () => resolve(timeoutResult), { once: true });
    }
  });

  try {
    return await Promise.race([
      fetchSide(chainMetadata, wrappedProviders, sdkMultiProvider, side, ctrl.signal),
      sideTimeoutPromise,
    ]);
  } catch (e) {
    // If the abort came from our own timeout (parent didn't abort), surface as a timeout error.
    if ((e instanceof AbortError || e instanceof IsmWalkAbortError) && !parentSignal?.aborted) {
      return timeoutResult;
    }
    throw e;
  } finally {
    // Abort the side's controller on ANY completion path (success, per-call
    // timeout error, side timeout, parent abort). Without this, a per-call
    // `timeout()` rejection unwinds through the success path and leaves
    // `ctrl` un-aborted — wrapped providers wouldn't short-circuit, and
    // SmartProvider's retry/fallback chain on the abandoned call would
    // keep firing background RPCs. Idempotent in already-aborted cases.
    ctrl.abort();
    clearTimeout(timer);
    parentSignal?.removeEventListener('abort', parentListener);
  }
}

async function fetchSide(
  chainMetadata: ChainMap<ChainMetadata>,
  providers: ChainMap<ethers.providers.Provider>,
  sdkMultiProvider: MultiProvider,
  side: { chainName: string; tokenAddress: string },
  signal?: AbortSignal,
): Promise<WarpRouteIsmSideResult> {
  const metadata = chainMetadata[side.chainName];
  if (!metadata) {
    return {
      kind: 'error',
      value: {
        chainName: side.chainName,
        tokenAddress: side.tokenAddress,
        error: 'Chain metadata not found',
      },
    };
  }
  if (metadata.protocol !== ProtocolType.Ethereum) {
    return {
      kind: 'unsupported',
      chainName: side.chainName,
      protocol: metadata.protocol,
    };
  }

  const provider = providers[side.chainName];
  if (!provider) {
    return {
      kind: 'error',
      value: {
        chainName: side.chainName,
        tokenAddress: side.tokenAddress,
        error: 'No provider available',
      },
    };
  }

  try {
    checkAborted(signal);
    const router = MailboxClient__factory.connect(side.tokenAddress, provider);

    const [ismAddrRaw, mailboxAddr, ownerRaw] = await Promise.all([
      timeout(router.interchainSecurityModule(), PER_CALL_TIMEOUT_MS),
      timeout(router.mailbox(), PER_CALL_TIMEOUT_MS),
      timeout(router.owner(), PER_CALL_TIMEOUT_MS),
    ]);
    checkAborted(signal);

    const { ismAddress, ismSource } = await resolveEffectiveIsm(provider, ismAddrRaw, mailboxAddr);
    checkAborted(signal);

    const [ismResult, ownerInfo] = await Promise.all([
      walkIsmTolerant(sdkMultiProvider, chainMetadata, side.chainName, ismAddress, signal),
      detectOwner(provider, ownerRaw),
    ]);
    checkAborted(signal);

    return {
      kind: 'data',
      value: {
        chainName: side.chainName,
        tokenAddress: side.tokenAddress,
        ismAddress,
        ismSource,
        ismTree: ismResult.tree,
        ismError: ismResult.error,
        owner: ownerRaw,
        ownerKind: ownerInfo.ownerKind,
        safeInfo: ownerInfo.safeInfo,
      },
    };
  } catch (e) {
    if (e instanceof AbortError || e instanceof IsmWalkAbortError) throw e;
    return {
      kind: 'error',
      value: {
        chainName: side.chainName,
        tokenAddress: side.tokenAddress,
        error: e instanceof Error ? e.message : String(e),
      },
    };
  }
}

async function walkIsmTolerant(
  sdkMultiProvider: MultiProvider,
  chainMetadata: ChainMap<ChainMetadata>,
  chainName: string,
  ismAddress: string,
  signal: AbortSignal | undefined,
): Promise<{ tree: IsmNode | null; error?: string }> {
  if (isZeroishAddress(ismAddress)) {
    return { tree: null, error: 'No ISM configured' };
  }
  try {
    const tree = await walkIsm(
      {
        multiProvider: sdkMultiProvider,
        chainMetadata,
        chainName,
        signal,
        visited: new Set<string>(),
      },
      ismAddress,
    );
    return { tree };
  } catch (e) {
    if (e instanceof AbortError || e instanceof IsmWalkAbortError) throw e;
    return { tree: null, error: e instanceof Error ? e.message : String(e) };
  }
}

async function resolveEffectiveIsm(
  provider: ethers.providers.Provider,
  tokenIsmAddress: string,
  mailboxAddress: string,
): Promise<{ ismAddress: string; ismSource: IsmSource }> {
  if (!isZeroishAddress(tokenIsmAddress)) {
    return { ismAddress: tokenIsmAddress, ismSource: 'token' };
  }
  const mailbox = Mailbox__factory.connect(mailboxAddress, provider);
  const defaultIsm = await mailbox.defaultIsm();
  return { ismAddress: defaultIsm, ismSource: 'mailbox-default' };
}

async function detectOwner(
  provider: ethers.providers.Provider,
  owner: string,
): Promise<{ ownerKind: OwnerKind; safeInfo?: SafeInfo }> {
  if (isZeroishAddress(owner)) return { ownerKind: 'eoa' };

  try {
    const safe = ISafe__factory.connect(owner, provider);
    // Two-method probe matches SDK's Safe detection (EvmWarpRouteReader):
    // a random contract might implement getThreshold(), so requiring nonce()
    // to also succeed reduces false positives.
    const [threshold] = await Promise.all([safe.getThreshold(), safe.nonce()]);

    let ownerCount = 0;
    try {
      const safeWithGetOwners = new ethers.Contract(owner, SAFE_GET_OWNERS_ABI, provider);
      const owners: string[] = await safeWithGetOwners.getOwners();
      ownerCount = owners.length;
    } catch {
      // Owner count unavailable; threshold still meaningful
    }

    return {
      ownerKind: 'safe',
      safeInfo: { threshold: threshold.toNumber(), ownerCount },
    };
  } catch {
    return { ownerKind: 'eoa' };
  }
}
