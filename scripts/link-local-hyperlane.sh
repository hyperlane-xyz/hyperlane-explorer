#!/usr/bin/env bash
# Install @hyperlane-xyz packages from a local monorepo checkout.
#
# Cardano support (ProtocolType.Cardano and its address utilities) is not in a
# published @hyperlane-xyz release yet, so this repo resolves those packages
# from tarballs built out of a monorepo checkout. Run this once after cloning,
# and again whenever you change those packages in the monorepo.
#
# Tarballs rather than `link:` on purpose: a symlink pointing outside the
# project cannot be resolved by Turbopack (and widening its root to the parent
# directory makes it scan the entire monorepo). A packed tarball installs into
# this project's own store, so every transitive dependency resolves normally.
#
# Delete this script, the `local-packages/` entry in .gitignore and the
# @hyperlane-xyz overrides in pnpm-workspace.yaml once the release lands.
set -euo pipefail

MONOREPO="${HYPERLANE_MONOREPO:-$(cd "$(dirname "$0")/.." && pwd)/../hyperlane-monorepo-cardano-explorer}"
PACKAGES=(utils provider-sdk sdk widgets)

cd "$(dirname "$0")/.."
OUT="$PWD/local-packages"

if [[ ! -d "$MONOREPO/typescript" ]]; then
    echo "No monorepo checkout at $MONOREPO" >&2
    echo "Set HYPERLANE_MONOREPO to the checkout containing the Cardano changes." >&2
    exit 1
fi

mkdir -p "$OUT"

for pkg in "${PACKAGES[@]}"; do
    dir="$MONOREPO/typescript/$pkg"
    if [[ ! -d "$dir/dist" ]]; then
        echo "$pkg is not built; run 'pnpm build' in $MONOREPO first" >&2
        exit 1
    fi
    echo "Packing $pkg"
    (cd "$dir" && pnpm pack --out "$OUT/hyperlane-xyz-$pkg.tgz" >/dev/null)
done

echo "Installing"
pnpm install --no-frozen-lockfile

echo "Done. Tarballs in $OUT"
