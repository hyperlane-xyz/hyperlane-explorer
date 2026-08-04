# Hyperlane Explorer App

An interchain explorer for the Hyperlane protocol and network.

## Cardano fork

This fork adds support for the Cardano chain (domain 2003), shaped so every
piece maps onto an upstream submission:

- `@hyperlane-xyz/utils` is overridden (see `pnpm-workspace.yaml`) with a build
  carrying `ProtocolType.Cardano` and its address codecs. The vendored tarball
  in `vendor/` is built from `equilibriumco/hyperlane-monorepo` branch
  `cardano-explorer`, whose `utils` differs from the upstream 33.0.2 release
  (`4815a47cc`) by exactly the cardano protocol commit. utils resolves once in
  the dependency graph, so sdk/widgets pick it up and `protocol: 'cardano'`
  survives metadata validation without an sdk override. The override
  disappears once upstream ships the protocol.
- Chain metadata, addresses, logos, and the wADA warp route come from the
  registry: point `NEXT_PUBLIC_REGISTRY_URL` / `NEXT_PUBLIC_REGISTRY_BRANCH` at
  `equilibriumco/hyperlane-registry` branch `cardano` (see `.env.example`) —
  the upstream custom-registry mechanism, no chain data in this repo. Chain and
  warp-route logos follow the configured registry instead of the hardcoded
  canonical CDN path.
- `config.apiUrl` reads `NEXT_PUBLIC_API_URL` so the app can point at a local
  scraper + Hasura stack (see `cardano/e2e-docker` in the monorepo).
- The message status timeline renders for Cardano messages and gets a
  `multiProvider`, so delivered messages show real per-stage timings.
- `postgresByteaToAddress` tolerates NULL bytea columns (a Cardano transaction
  pays out to many UTXOs, so it has no single recipient).
- `CardanoHypNative`/`CardanoHypCollateral` are recognized for collateral
  badges the same way the existing Starknet workaround is, until this app's SDK
  version carries the cardano token standards.

- The Warp Route Overview shows the Cardano leg's locked ADA, read server-side
  via `/api/cardano-warp-route-balance` (mirroring the Sealevel route) since the
  browser has no Cardano provider and Blockfrost needs a project id. Set
  `BLOCKFROST_API_KEY`; without it the read returns 501 and the balance is
  omitted. Native routes only.

Known limits: the live-RPC features (Warp Route Security ISM tree,
pending-message debugging) stay EVM-only, as they are upstream for every
non-EVM chain.

## Running against a self-hosted scraper

```sh
NEXT_PUBLIC_API_URL=http://localhost:8080/v1/graphql \
NEXT_PUBLIC_REGISTRY_URL=https://github.com/equilibriumco/hyperlane-registry \
NEXT_PUBLIC_REGISTRY_BRANCH=cardano \
  pnpm run dev
```

## Setup

```sh
# Install dependencies
pnpm install

# Build source and generate types
pnpm run build
```

## Test

```sh
# Run all unit tests
pnpm run test

# Lint check code
pnpm run lint
```

## Learn more

For more information, see the [Hyperlane documentation](https://v3.hyperlane.xyz).
