import { ISafe__factory, Mailbox__factory, MailboxClient__factory } from '@hyperlane-xyz/core';
import type { ChainMap, ChainMetadata } from '@hyperlane-xyz/sdk';
import { MultiProvider } from '@hyperlane-xyz/sdk';
import { isZeroishAddress, ProtocolType, timeout } from '@hyperlane-xyz/utils';
import { ethers } from 'ethers';

import { AbortError, wrapWithAbort } from './abortableProvider';
import { walkIsm, IsmWalkAbortError, type IsmNode } from './walkIsm';

export type OwnerKind = 'eoa' | 'safe' | 'unknown';
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
  const wrappedProviders: ChainMap<ethers.providers.Provider> = {};
  for (const [chain, provider] of Object.entries(input.providers)) {
    wrappedProviders[chain] = wrapWithAbort(provider, input.signal);
  }
  const sdkMultiProvider = new MultiProvider(input.chainMetadata, {
    providers: wrappedProviders,
  });

  const [origin, destination] = await Promise.all([
    runSideWithTimeout(
      input.chainMetadata,
      wrappedProviders,
      sdkMultiProvider,
      input.origin,
      input.signal,
    ),
    runSideWithTimeout(
      input.chainMetadata,
      wrappedProviders,
      sdkMultiProvider,
      input.destination,
      input.signal,
    ),
  ]);

  return { origin, destination };
}

async function runSideWithTimeout(
  chainMetadata: ChainMap<ChainMetadata>,
  providers: ChainMap<ethers.providers.Provider>,
  sdkMultiProvider: MultiProvider,
  side: { chainName: string; tokenAddress: string },
  parentSignal?: AbortSignal,
): Promise<WarpRouteIsmSideResult> {
  // Compose a side-scoped abort signal that fires when either:
  //  (a) the parent signal aborts (React Query unmount / navigation), or
  //  (b) the side-level timeout elapses.
  // This way the timeout doesn't just race a UI message — it actually halts
  // the underlying walk via the same abort plumbing the rest of the code uses.
  const ctrl = new AbortController();
  if (parentSignal?.aborted) ctrl.abort();
  const parentListener = () => ctrl.abort();
  parentSignal?.addEventListener('abort', parentListener);
  const timer = setTimeout(() => ctrl.abort(), SIDE_TIMEOUT_MS);

  try {
    return await fetchSide(chainMetadata, providers, sdkMultiProvider, side, ctrl.signal);
  } catch (e) {
    // If the abort came from our own timeout (parent didn't abort), surface as a timeout error.
    if ((e instanceof AbortError || e instanceof IsmWalkAbortError) && !parentSignal?.aborted) {
      return {
        kind: 'error',
        value: {
          chainName: side.chainName,
          tokenAddress: side.tokenAddress,
          error: `Timed out after ${SIDE_TIMEOUT_MS / 1000}s`,
        },
      };
    }
    throw e;
  } finally {
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
      { multiProvider: sdkMultiProvider, chainMetadata, chainName, signal },
      ismAddress,
    );
    return { tree };
  } catch (e) {
    if (e instanceof IsmWalkAbortError) throw e;
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
