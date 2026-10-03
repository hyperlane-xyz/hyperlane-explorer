# Hyperlane Explorer Hasura API Analysis (for GCP migration)

## TL;DR

- Explorer UI is **frontend-heavy** and reads directly from Hasura GraphQL at:
  - `https://explorer4.hasura.app/v1/graphql`
  - Source: `src/consts/config.ts`
- In this repo, there is **no active general backend API** anymore (only OG image route support).
  - `src/pages/api` only has `og.tsx`
- Data production backend is in `hyperlane-xyz/hyperlane-monorepo`:
  - `rust/main/agents/scraper/*` (indexer/scraper)
  - `rust/main/agents/scraper/migration/*` (Postgres schema/views)
- The key query surface Explorer depends on is small:
  - `message_view(...)`
  - `domain(...)`
  - (other consumers also use `raw_message_dispatch(...)`)

---

## What this Explorer app actually calls

## 1) Endpoint wiring

- `src/consts/config.ts` hardcodes:
  - `apiUrl: 'https://explorer4.hasura.app/v1/graphql'`
- `src/pages/_app.tsx` creates the urql client with `url: config.apiUrl`.

## 2) Query roots used by this app

### `message_view`

Used for:
- Search list (`useMessageSearchQuery`)
- Message detail (`useMessageQuery`)
- SSR OG metadata fetch (`fetchMessageForOG`)

Files:
- `src/features/messages/queries/build.ts`
- `src/features/messages/queries/fragments.ts`
- `src/features/messages/queries/useMessageQuery.ts`
- `src/features/messages/queries/serverFetch.ts`

### `domain`

Used for:
- Scraped chains/domain metadata
- OG domain-name lookup

Files:
- `src/features/chains/queries/fragments.ts`
- `src/features/chains/queries/useScrapedChains.ts`
- `src/features/messages/queries/serverFetch.ts`

## 3) Hasura behavior confirmed live

From live probing of `explorer4.hasura.app`:

- Anonymous read works (no auth header required for these queries).
- Introspection is disabled for anonymous role.
- Mutations are disabled (`no mutations exist`).
- `@cached(ttl: 5)` works and adds `Cache-Control: max-age=5`.

---

## Effective API contract you must preserve

## 1) `message_view` field contract used by Explorer

From `messageStubFragment` + `messageDetailsFragment`:

- IDs / routing:
  - `id`, `msg_id`, `nonce`
  - `origin_domain_id`, `destination_domain_id`
  - `origin_chain_id`, `destination_chain_id`
- Sender/recipient and tx IDs:
  - `sender`, `recipient`
  - `origin_tx_hash`, `origin_tx_sender`, `origin_tx_recipient`
  - `destination_tx_hash`, `destination_tx_sender`, `destination_tx_recipient`
- Timing/status:
  - `is_delivered`
  - `send_occurred_at`, `delivery_occurred_at`, `delivery_latency`
- Block/tx gas details for detail page:
  - `origin_block_*`, `destination_block_*`
  - `origin_tx_*`, `destination_tx_*`
- Payment summary:
  - `total_gas_amount`, `total_payment`, `num_payments`
- Payload:
  - `message_body`

## 2) `domain` field contract used by Explorer

From `DOMAINS_QUERY`:

- `id`, `native_token`, `name`, `is_test_net`, `is_deprecated`, `chain_id`

## 3) Filter + query semantics expected by frontend

From `buildMessageQuery` and `buildMessageSearchQuery`:

- Typed vars include:
  - `bytea`, `[bytea!]`, `[Int!]`, `timestamp`
- WHERE operators used:
  - `_eq`, `_in`, `_gte`, `_lte`, `_and`, `_or`
- Ordering/pagination:
  - `order_by: { id: desc }`
  - `limit: N`
- Search implementation detail:
  - Search generates multiple aliased subqueries (`q0`, `q1`, ...) and client dedupes by DB `id`.

## 4) Encoding contract

Critical:

- Binary values are expected in Postgres bytea text form (`\\x...`) from API.
- Client converts hex/address/tx hash to bytea for filters.
- Timestamps often returned without timezone suffix; client appends `Z` before parsing.

If replacement changes byte encoding, filters and parsing will break.

---

## Where the backend/source-of-truth lives

## In this repo (`hyperlane-explorer`)

- Active server-side API code for messages is not present.
- Historical API routes were removed:
  - Commit: `673c67a` (`fix: remove api code`)
  - Removed:
    - `src/pages/api/index.ts`
    - `src/pages/api/latest-nonce.ts`
  - PR body note: disabled until rate-limiting solved.

There is still dead/unwired API helper logic under `src/features/api/*`, but no route uses it.

## In `hyperlane-monorepo` (confirmed)

Core producer pipeline:

- Scraper agent entrypoint:
  - `rust/main/agents/scraper/src/main.rs`
  - `rust/main/agents/scraper/src/agent.rs`
- DB write path:
  - `rust/main/agents/scraper/src/store/*`
  - `rust/main/agents/scraper/src/db/*`
- Schema + views:
  - `rust/main/agents/scraper/migration/src/m20230309_000005_create_table_message.rs`
    - creates `message` table
    - creates `message_view` SQL view
  - `...000001_create_table_domain.rs` (domain seed + schema)
  - `...000004_create_table_gas_payment.rs` (gas payments + `total_gas_payment` view)
  - `...20250224_000006_create_table_raw_message_dispatch.rs`

Meaning:
- Scraper + Postgres schema are in monorepo.
- Hasura layer exposing GraphQL likely sits in infra/deployment config not visible in this repo.

---

## Additional live GraphQL surfaces seen (important for infra consumers)

Even if Explorer UI doesn’t use them, other Hyperlane components do:

- `raw_message_dispatch(...)` is exposed publicly and queryable.
  - Used by monorepo CCIP server code (`typescript/ccip-server/.../HyperlaneService.ts`)
- Rebalancer queries `message_view` directly (`typescript/rebalancer/src/utils/ExplorerClient.ts`).

So replacement scope may be broader than just Explorer web UI.

---

## GCP migration recommendation (minimal-risk)

## Phase 1 (fastest): preserve GraphQL contract, replace hosting

Keep contract nearly identical; swap infra:

1. Run scraper/indexer pipeline (from monorepo) into GCP Postgres/Cloud SQL.
2. Recreate schema + views (`domain`, `message`, `message_view`, `gas_payment`, `delivered_message`, optional `raw_message_dispatch`).
3. Front with GraphQL service that matches current query behavior:
   - easiest path: Hasura on GCP (self-hosted), same exposed roots/permissions
   - enforce read-only anonymous role + disabled mutations + no introspection
4. Point Explorer `config.apiUrl` to new endpoint.

Why this first:
- Lowest app churn.
- Avoid rewriting frontend query builder/parser and all bytea assumptions.
- Enables gradual hardening (auth, rate limits, caching).

## Phase 2 (optional): replace Hasura itself

Once stable, move to custom GraphQL/REST if desired. Do only after contract test parity exists.

---

## Required parity checklist before cutover

- [ ] `message_view` query compatibility (fields, filter operators, ordering, limits)
- [ ] `domain` query compatibility
- [ ] `bytea` filter/response format parity (`\\x...`)
- [ ] timestamp parsing compatibility
- [ ] caching behavior equivalent for 5s poll loops
- [ ] anonymous read role parity + introspection/mutation posture
- [ ] (if needed) `raw_message_dispatch` compatibility for CCIP/etc

---

## Open questions to resolve early

1. Do you want to keep GraphQL + Hasura semantics exactly at first cut?
2. Should non-Explorer consumers (`rebalancer`, `ccip-server`) be in-scope for same endpoint day 1?
3. Is Cloud SQL Postgres the target DB, or BigQuery-backed materialization?
4. Do you want to retain anonymous public access, or put API behind gateway + key/rate limits?
