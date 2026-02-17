# AGENTS.md

**Be extremely concise. Sacrifice grammar for concision. Terse responses preferred. No fluff.**

This file provides guidance to AI coding assistants when working with code in this repository.

## Project Overview

Hyperlane Explorer is a Next.js 15 web application for exploring interchain messages on the Hyperlane protocol. It allows users to search, view, and debug cross-chain messages.

## Plan Mode

- Make the plan extremely concise. Sacrifice grammar for the sake of concision.
- At the end of each plan, give me a list of unresolved questions to answer, if any.

## Development Commands

```bash
pnpm install          # Install dependencies
pnpm run dev          # Start dev server (http://localhost:3000)
pnpm run build        # Production build
pnpm run typecheck    # TypeScript type checking
pnpm run lint         # ESLint with Next.js rules
pnpm run test         # Run Jest tests
pnpm run prettier     # Format code in src/
```

## Architecture

### State Management
- **Zustand store** (`src/store.ts`) manages global state: chain metadata, MultiProtocolProvider, warp routes
- State persists to localStorage with version migrations
- Use `useMultiProvider()`, `useChainMetadata()`, `useRegistry()` hooks to access state

### Data Fetching
- **GraphQL via urql** for querying the Hasura API (`https://explorer4.hasura.app/v1/graphql`)
- **TanStack React Query** for caching
- **Ethers.js v5** for direct blockchain calls
- PI (Permissionless Interop) chains have separate query paths in `src/features/messages/pi-queries/`

### Feature Structure
Features are self-contained in `src/features/`:
- `messages/` - Message search, display, and detail cards
- `chains/` - Chain metadata and configuration
- `api/` - External API integration
- `deliveryStatus/` - Message delivery tracking
- `debugger/` - Message inspection utilities

### URL State
Search filters sync with URL query params via `src/utils/queryParams.ts` for shareable links.

### Key Dependencies
- `@hyperlane-xyz/sdk` - Core Hyperlane SDK
- `@hyperlane-xyz/registry` - Chain and protocol registry (fetched at runtime)
- `@hyperlane-xyz/widgets` - Pre-built UI components

## Configuration

### Environment Variables
- `NEXT_PUBLIC_REGISTRY_URL` - Custom registry URL (optional)
- `NEXT_PUBLIC_REGISTRY_BRANCH` - Registry branch (default: 'main')
- `EXPLORER_API_KEYS` - JSON object with block explorer API keys

### Important Config Files
- `src/consts/config.ts` - Runtime configuration
- `src/consts/api.ts` - API endpoints
- `tailwind.config.js` - Custom colors, spacing, and `xs` breakpoint at 480px

## Code Style

- Single quotes, trailing commas, 100 char line width
- Prettier with import organization and Tailwind class sorting
- Use `clsx()` for conditional classNames

## Engineering Philosophy

### Keep It Simple
We handle ONLY the most important cases. Don't add functionality unless it's small or absolutely necessary.

### Error Handling
- **Expected issues** (external systems, user input): Use explicit error handling, try/catch at boundaries
- **Unexpected issues** (invalid state, broken invariants): Fail loudly with `throw` or `console.error`
- **NEVER** add silent fallbacks for unexpected issues - they mask bugs

### Backwards-Compatibility
| Change Location | Backwards-Compat? | Rationale |
|-----------------|-------------------|-----------|
| Local/uncommitted | No | Iteration speed; no external impact |
| In main unreleased | Preferred | Minimize friction for other developers |
| Released | Required | Prevent breaking downstream integrations |

## Code Review

For code review guidelines, see `.github/prompts/code-review.md`.

### PR Review Comment Format

**Use inline comments** for specific feedback on code changes. Use the GitHub API to post reviews:

```bash
gh api repos/{owner}/{repo}/pulls/{pr}/reviews --input - << 'EOF'
{
  "event": "COMMENT",
  "body": "Overall summary (optional)",
  "comments": [
    {"path": "file.ts", "line": 42, "body": "Specific issue here"},
    {"path": "file.ts", "start_line": 10, "line": 15, "body": "Multi-line comment"}
  ]
}
EOF
```

| Feedback Type        | Where                                   |
| -------------------- | --------------------------------------- |
| Specific code issue  | Inline comment on that line             |
| Repeated pattern     | Inline on first, mention others in body |
| Architecture concern | Summary body                            |

**Limitation**: Can only comment on lines in the diff (changed lines). Comments on unchanged code fail.

## Tips for AI Coding Sessions

1. **Run tests incrementally** - `pnpm run test` for Jest tests
2. **Check existing patterns** - Search codebase for similar implementations
3. **Use SDK types** - Import from `@hyperlane-xyz/sdk`, don't redefine
4. **Zustand for state** - Global state in `src/store.ts`
5. **Keep changes minimal** - Only modify what's necessary; avoid scope creep
6. **Feature folders** - Domain logic in `src/features/`, not scattered
7. **Dedupe constants** - Check `src/consts/` and `src/types.ts` before adding new ones
8. **Unit tests for utils** - New utility functions need `.test.ts` files
9. **Query limits** - Use `SEARCH_QUERY_LIMIT` for searches, larger batches for background ops
10. **Existing utils** - Use `formatAmountCompact`, `shortenAddress`, `tryGetBlockExplorerAddressUrl`
11. **Edge runtime** - API routes can't import @hyperlane-xyz/utils; use self-contained code
12. **Color consistency** - Green for success only on destination, blue/neutral elsewhere

## Verify Before Acting

**Always search the codebase before assuming.** Don't hallucinate file paths, function names, or patterns.

- `grep` or search before claiming "X doesn't exist"
- Read the actual file before suggesting changes to it
- Check `git log` or blame before assuming why code exists
- Verify imports exist in `package.json` before using them

## When the AI Gets It Wrong

If output seems wrong, check:

1. **Did I read the actual file?** Or did I assume its contents?
2. **Did I search for existing patterns?** The codebase likely has examples
3. **Am I using stale context?** Re-read files that may have changed
4. **Did I verify the error message?** Run the command and read actual output
