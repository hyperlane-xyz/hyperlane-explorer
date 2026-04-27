---
name: commit
description: Commit changes following project quality gates and best practices. Run before creating any git commit.
---

# Commit Skill

Use this skill when committing changes to ensure quality and correctness.

## Pre-Commit Checklist

Run these in order. **Do not commit if any fail.**

1. **`pnpm run format`** — Format `src/` with oxfmt
2. **`pnpm run lint`** — Lint `src/` with oxlint
3. **`pnpm run typecheck`** — Verify TypeScript compiles (`tsc`)
4. **`pnpm run test`** — Run Jest tests (use `--testPathIgnorePatterns="scheduleWhenIdle|fetchPiChainMessages"` to skip pre-existing infra/flaky failures unless you've fixed them)
5. **`pnpm run build`** — Optional for small changes, required before PR. Note: `prebuild` fetches fonts and may need `.env.local`.

## Staging Rules

- **Only stage files related to the current task.** Review `git status` carefully.
- **Never stage unrelated files** — markdown notes (`SSR_PERF_TODO.md`, `TENDERLY_INTEGRATION_PLAN.md`, `WARP_FEES.md`), scratch files, work-in-progress features (`src/features/simulation/`, `src/pages/api/simulate.ts`), or auto-generated files (`next-env.d.ts`) should not be committed unless explicitly requested.
- **Use specific file paths** with `git add`, not `git add .` or `git add -A`.
- **Review `git diff --staged`** before committing to verify only intended changes are included.

## Commit Message Format

Match the repo's existing style (run `git log --oneline -10` to confirm):

- Conventional prefixes with optional scope: `fix(tron):`, `fix(warpFees):`, `feat(messages):`, `perf:`, `docs:`, `refactor:`, `test:`, `chore:`
- First line under 72 characters
- Blank line, then a short body explaining **why** (not what — the diff shows what)
- End with `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`
- Use a HEREDOC to pass the message to avoid shell escaping issues

## Things to Watch For

- **Secrets**: Never commit `.env`, `.env.local`, credentials, or API keys
- **Large files**: Don't commit binaries, build artifacts, or font files (check `.gitignore`)
- **Formatting drift**: If oxfmt changed files you didn't touch, stage them separately or skip them
- **`next-env.d.ts`**: Auto-modified by Next dev server — don't include unless intentionally upgrading Next
- **Untracked WIP**: Files like `*_TODO.md` or `*_PLAN.md` at repo root are personal scratch — never stage

## Example Flow

```bash
pnpm run format
pnpm run lint
pnpm run typecheck
pnpm run test
git status                    # review what changed
git diff                      # verify changes are correct
git add <specific-files>      # only related files
git diff --staged             # double-check staged changes
git commit -m "$(cat <<'EOF'
fix(scope): description of change

Short explanation of why this change is needed.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```
