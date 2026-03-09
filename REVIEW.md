# Code Review Guidelines

## Always flag
- XSS vulnerabilities: unsanitized user input rendered in the DOM
- Secrets or API keys committed in code or logs
- Introduction of `as` type assertions, `as any`, `as unknown as X`, or `!` non-null assertions
- New async IIFEs in useEffect (use `.then().catch()` pattern instead)
- Silent error swallowing (empty catch blocks or catch-and-ignore)
- Direct DOM manipulation instead of React state
- Missing error boundaries or unhandled promise rejections in data fetching
- New external script/resource URLs without CSP header updates in `next.config.js`
- GraphQL queries without proper error handling
- State mutations outside of Zustand store actions
- New API routes that import from `@hyperlane-xyz/utils` (Edge runtime incompatible)

## Never flag
- Formatting or style issues (handled by prettier and eslint)
- Missing documentation or comments on self-evident code
- Existing patterns that are intentional (check git history if unsure)
- Minor naming preferences when existing convention is followed
- Tailwind class ordering (handled by prettier plugin)
- Import ordering

## Skip these paths
- `node_modules/`
- `.next/`
- `*.lock` files
- `public/` static assets
