# Hyperlane Explorer App

An interchain explorer for the Hyperlane protocol and network.

## Setup

```sh
# Install dependencies
pnpm install

# Build source and generate types
pnpm run build
```

### Local @hyperlane-xyz packages (temporary)

Cardano support is not in a published `@hyperlane-xyz` release yet, so
`pnpm-workspace.yaml` resolves `utils`, `provider-sdk`, `sdk` and `widgets` from
tarballs built out of a monorepo checkout. Build the monorepo, then:

```sh
# Defaults to ../hyperlane-monorepo-cardano-explorer
HYPERLANE_MONOREPO=/path/to/hyperlane-monorepo ./scripts/link-local-hyperlane.sh
```

Re-run it after changing those packages. Delete the script, the overrides and
the `local-packages/` gitignore entry once the release lands.

## Running against a self-hosted scraper

By default the explorer queries the hosted API. To browse a chain that is not on
the hosted deployment — Cardano, for now — point it at your own scraper's
GraphQL endpoint (the monorepo's `cardano/e2e-docker` compose stack brings up
the scraper, Postgres and Hasura):

```sh
NEXT_PUBLIC_API_URL=http://localhost:8080/v1/graphql pnpm run dev
```

## Development

```sh
# Start the Next dev server
pnpm run dev
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
