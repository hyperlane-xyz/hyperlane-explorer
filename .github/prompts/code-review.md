Review this pull request. Focus on:

## Code Quality

- Logic errors and potential bugs
- Error handling and edge cases
- Code clarity and maintainability
- Adherence to existing patterns in the codebase
- **Use existing utilities** - Search codebase before adding new helpers
- **Prefer `??` over `||`** - Preserves zero/empty string as valid values
- **No async IIFEs** - Use `.then().catch()` instead of `void (async () => { ... })()` (in `useEffect`, named inner async funcs are fine: `const load = async () => { ... }; load();`; anonymous async IIFEs still disallowed)

## Architecture

- Consistency with existing architecture patterns
- Breaking changes or backward compatibility issues
- API contract changes
- **Deduplicate** - Move repeated code/types to shared files
- **Extract utilities** - Shared functions belong in utils packages

## Testing

- Test coverage for new/modified code
- Edge cases that should be tested
- **New utility functions need unit tests**

## Performance

- Unnecessary re-renders or computations
- Bundle size impact of new dependencies

## Explorer-Specific

- **Use existing utilities** - Check `src/utils/` (formatAmountCompact, shortenAddress, tryGetBlockExplorerAddressUrl)
- **Query limits** - Use SEARCH_QUERY_LIMIT for searches, larger batches for background ops
- **Deduplicate** - Move repeated constants/types to `src/consts/` or `src/types.ts`
- **URL state sync** - Search filters should sync with URL query params
- **PI chains** - Permissionless Interop chains have separate query paths in `src/features/messages/pi-queries/`
- **Edge runtime** - Can't import @hyperlane-xyz/utils in edge runtime (API routes)
- **Export reusable components** - Common UI patterns should be extracted

## UI Consistency

- **Color consistency** - Don't mix multiple shades; use design system colors
- **Green = success at destination** - Not origin; use blue/neutral for origin
- **Avoid wasted space** - Keep layouts compact and information-dense
- **Collapsible for detail** - Use collapsible sections for verbose content

Provide actionable feedback with specific line references.
Be concise. For minor style issues, group them together.
Security issues are handled by a separate dedicated review.
