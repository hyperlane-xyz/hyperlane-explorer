# Warp Route ISM Section — Implementation

## Goal
Show the configured ISM tree and contract owner for a warp route's origin and destination tokens on the message detail page, read directly from on-chain contracts. EVM-only, lazy-loaded behind an expandable card. Gated to registry-matched warp routes.

## File map

**New**
- `src/features/messages/cards/WarpRouteIsmDetailsCard.tsx` — main expandable card; renders origin + destination panes
- `src/features/messages/cards/ismRender/IsmConfigDisplay.tsx` — recursive tree renderer for `IsmNode`
- `src/features/messages/cards/ismRender/OwnerDisplay.tsx` — owner row with EOA / Safe N/M badge
- `src/features/messages/cards/ismRender/AddressInline.tsx` — shared address pill: truncated mono + copy button + block-explorer link
- `src/features/messages/queries/useWarpRouteIsm.ts` — React Query hook with abort signal threading
- `src/features/messages/queries/fetchWarpRouteIsm.ts` — per-side fetcher (router reads, owner detection, walker entry, abort plumbing)
- `src/features/messages/queries/walkIsm.ts` — recursive on-chain ISM walker
- `src/features/messages/queries/abortableProvider.ts` — Proxy that makes any ethers provider abort-aware
- `src/features/messages/queries/fetchWarpRouteIsm.test.ts` — Jest tests
- `src/images/icons/lock.svg` — header icon (matches `hub.svg` style)

**Edited**
- `src/features/messages/MessageDetailsInner.tsx` — slot the new card directly under `WarpTransferDetailsCard`, gated by the same `warpRouteDetails &&` check

## Data flow

```
useWarpRouteIsm (React Query, enabled when card is expanded)
   └── fetchWarpRouteIsm
         ├── pull explorer's ethers providers via getEthersV5Provider(chain)
         ├── wrap each with wrapWithAbort(provider, signal) [abortableProvider.ts]
         ├── construct SDK MultiProvider with the wrapped providers
         └── for each side (origin, destination):
               runSideWithTimeout
                 ├── compose side AbortController (parent-abort OR 60s timeout)
                 └── fetchSide
                       ├── MailboxClient__factory.connect(token) → reads:
                       │     interchainSecurityModule(), mailbox(), owner()
                       ├── if ISM is zero: Mailbox.defaultIsm() → labeled "mailbox default"
                       ├── walkIsmTolerant → walkIsm (recursive tree walker)
                       └── detectOwner: ISafe.getThreshold/getOwners → EOA vs Safe N/M
```

## ISM walking — `walkIsm.ts`

Per-node strategy that combines SDK type-detection accuracy with our own
failure-tolerant recursion:

1. **Per-call AbortController** — aborts on parent abort OR per-call **20s timeout**. The provider used inside this call is freshly wrapped against this call-specific signal, so when the per-call timeout fires the SmartProvider's retry/multi-RPC fallback short-circuits — no zombie network requests after timeout.

2. **Coarse moduleType probe** — single `moduleType()` read so we always have at least a fallback label (`Routing ISM`, `Aggregation ISM`, `Message ID Multisig ISM`, etc.) even if the deeper SDK derivation later fails or times out.

3. **`ShallowEvmIsmReader`** subclasses the SDK's `EvmIsmReader` and overrides `deriveIsmConfig(string)` to return an address-only placeholder. The SDK's per-type derivers (`deriveAggregationConfig`, `deriveRoutingConfig`, `deriveNullConfig`, etc.) think they're recursing — but they get back stub configs. So:
   - SDK gives us the **correct refined type label** per node (`Trusted Relayer ISM`, `Pausable ISM`, `Fallback Routing ISM`, `Incremental Routing ISM`, `Merkle Root Multisig ISM` vs `Message ID Multisig ISM`, etc.)
   - SDK gives us the **immediate child addresses** in the right structure (modules / domains / lower+upper / isms)
   - Recursion stops at one level inside the SDK

4. **Walker drives recursion ourselves** with per-branch `try/catch`. If one sub-domain reverts, that branch shows the error and siblings continue. Children are walked in parallel with **concurrency 4** to avoid slamming RPCs.

5. **Result shape** — `IsmNode`:
   ```ts
   {
     address: string;
     typeLabel: string;        // "Aggregation ISM" / "Pausable ISM" / etc.
     ismType?: string;         // raw SDK type when known
     children?: IsmChild[];    // recursive
     error?: string;           // per-node error annotation
   }
   ```

## Abort handling — `abortableProvider.ts`

Proxy wraps the explorer's `HyperlaneSmartProvider`. Intercepts `send`, `perform`, `performWithFallback`, `wrapProviderPerform`, `call`, `getCode`, `getBlock`, `getBlockNumber`, `getTransaction`, `getTransactionReceipt`. Each intercepted call checks `signal.aborted` first and throws `AbortError` if so.

Why intercept the SmartProvider's internal methods (`performWithFallback`, `wrapProviderPerform`)? Because the smart provider's retry loop and multi-RPC fallback chain call those directly via `this.*` — without intercepting them, a retry attempt after abort would still dispatch a fresh network request. By gating them, the retry chain short-circuits cleanly.

Three abort layers stack:
- React Query's signal (fires on component unmount / navigation)
- Side-level AbortController in `runSideWithTimeout` (60s safety net)
- Per-call AbortController inside `walkIsm` (20s per node)

Any of them aborting propagates instantly to all subsequent RPC dispatches.

## Hook — `useWarpRouteIsm.ts`

```ts
useWarpRouteIsm({
  originChainName, originTokenAddress,
  destinationChainName, destinationTokenAddress,
  enabled,                   // wired to card's expand state
})
```

- `enabled` only becomes true when the card is expanded → no fetch until user clicks
- `retry: false` — no React Query retries on failure
- `gcTime: 0` — query cache dropped immediately on unmount
- `staleTime: Infinity` — config rarely changes within a session, no refetches
- React Query's `signal` is threaded into `fetchWarpRouteIsm`

## Type label refinement

The SDK's reader uses feature-detection probes that map raw `moduleType` to refined ISM types:

| moduleType | SDK refines to |
|---|---|
| 1 ROUTING | `domainRoutingIsm`, `defaultFallbackRoutingIsm`, `incrementalDomainRoutingIsm`, `amountRoutingIsm`, `interchainAccountRouting` |
| 2 AGGREGATION | `staticAggregationIsm` (or `storageAggregationIsm` on zkSync) |
| 4 MERKLE_ROOT_MULTISIG | `merkleRootMultisigIsm` |
| 5 MESSAGE_ID_MULTISIG | `messageIdMultisigIsm` |
| 6 NULL | `trustedRelayerIsm`, `pausableIsm`, `testIsm`, plain null |
| 7 CCIP_READ | `offchainLookupIsm`, `ccipIsm` |
| 8 ARB_L2_TO_L1 | `arbL2ToL1Ism` |
| 9/10 WEIGHTED_*_MULTISIG | weighted variants |

All labels are suffixed with `ISM` in the UI (`Aggregation ISM`, `Pausable ISM`, `Message ID Multisig ISM`, etc.). On per-node failure, we fall back to a coarse label from `moduleType` alone (`Routing ISM`, `Aggregation ISM`, `Null ISM`, etc.) so a slow node still shows the right ballpark.

## UI — `WarpRouteIsmDetailsCard`

```
┌─ [lock-icon]  Warp Route Security  [?]                ⌃ ┐
│                                                          │
│  Origin · Arbitrum                                       │
│   Owner: 0xab… [copy] [↗]  [Safe 2/3]                    │
│   Aggregation ISM 0x36ef… [copy] [↗]  [mailbox default]  │
│     Pausable ISM 0xb45… [copy] [↗]                       │
│     Routing ISM 0xb83… [copy] [↗]  (Timed out 20000ms)   │
│                                                          │
│  Destination · Ethereum                                  │
│   ...                                                    │
└──────────────────────────────────────────────────────────┘
```

- Header matches `Warp Route Overview` styling: 28×28 line-art icon (`lock.svg` filled `#3d304c`) + `text-md font-medium text-primary-800` title + question-mark tooltip
- Section headers (`Origin · Arbitrum`) at `text-base font-bold`
- Tree: every node = `<bold-type-label> <address> [copy] [↗] [annotations]`
- Tree connectors: `border-l border-gray-200` + indent per recursion level
- Children labelled with chain name (routing) / `lower` / `upper` (amount routing)
- Owner badge: `EOA` (gray) or `Safe N/M` (purple)
- Mailbox-default badge appears inline on the tree root, not as a separate ISM line
- Per-node error annotated as e.g. `(Timed out 20000ms)` or `(Failed to walk child)` while siblings render normally

## Edge cases
- ISM = `0x0` → fetch `Mailbox.defaultIsm()`, label tree root with `mailbox default` badge
- Non-EVM side (Cosmos / SVM / Tron) → renders "ISM details not available for {protocol} chains."
- Owner = `0x0` → "No owner (immutable)"
- Side timeout (60s) → still surfaces as `Timed out after 60s`, but the underlying walk has actually halted via the same abort plumbing
- Parallel children: if 1 of 4 workers is stuck on a slow RPC, the other 3 drain the queue; final stuck branch resolves via per-call timeout (20s)
- React Query unmount during fetch: parent signal aborts → all in-flight calls short-circuit → no orphaned network activity

## Tests
9 Jest tests in `fetchWarpRouteIsm.test.ts` cover: non-EVM skip, missing chain metadata, token vs mailbox-default ISM source, EOA/Safe owner detection, owner-count fallback when `getOwners` is unavailable, walker error propagation, per-side error isolation.

## Decisions worth remembering
- `MailboxClient__factory` (not `HypERC20__factory`) — parent of all warp route token standards, exposes the methods we need
- The explorer's `HyperlaneSmartProvider` (multi-RPC fallback + retries) is reused via `useReadyMultiProvider`. We don't bypass it — instead we make it abort-aware by wrapping with a Proxy that intercepts both public and protected/internal methods
- `EvmIsmReader` is reused for type detection only; we shut down its recursion by subclassing as `ShallowEvmIsmReader` so we can drive recursion manually with per-branch try/catch and parallel concurrency control
- Per-call AbortController per ISM node is critical — without it, a per-call timeout merely resolves our await while the underlying SDK derive keeps firing network requests in the background
